const mongoose = require('mongoose');
const ParkingLot = require('../models/ParkingLot');
const ParkingSlot = require('../models/ParkingSlot');

function isValidObjectId(value) {
  return mongoose.isValidObjectId(value);
}

function cleanLotInput(body, allowPartial) {
  const result = {};
  for (const key of ['name', 'address', 'city']) {
    if (body[key] === undefined && allowPartial) continue;
    if (typeof body[key] !== 'string' || !body[key].trim()) {
      return { error: key + ' is required and must be a non-empty string.' };
    }
    result[key] = body[key].trim();
  }

  if (result.name && (result.name.length < 2 || result.name.length > 120)) {
    return { error: 'Name must contain 2 to 120 characters.' };
  }
  if (result.address && (result.address.length < 3 || result.address.length > 250)) {
    return { error: 'Address must contain 3 to 250 characters.' };
  }
  if (result.city && (result.city.length < 2 || result.city.length > 100)) {
    return { error: 'City must contain 2 to 100 characters.' };
  }
  if (allowPartial && Object.keys(result).length === 0) {
    return { error: 'Provide at least one field to update.' };
  }
  return { value: result };
}

async function listLots(_req, res) {
  const lots = await ParkingLot.find({ isActive: true })
    .select('name address city isActive createdAt updatedAt')
    .sort({ city: 1, name: 1 })
    .lean();
  return res.status(200).json({ lots });
}

async function getLot(req, res) {
  if (!isValidObjectId(req.params.lotId)) {
    return res.status(400).json({ message: 'Invalid parking lot ID.' });
  }
  const lot = await ParkingLot.findOne({ _id: req.params.lotId, isActive: true }).lean();
  if (!lot) return res.status(404).json({ message: 'Parking lot not found.' });
  return res.status(200).json({ lot });
}

async function getLotSlots(req, res) {
  if (!isValidObjectId(req.params.lotId)) {
    return res.status(400).json({ message: 'Invalid parking lot ID.' });
  }
  const lot = await ParkingLot.findOne({ _id: req.params.lotId, isActive: true }).select('_id');
  if (!lot) return res.status(404).json({ message: 'Parking lot not found.' });

  const slots = await ParkingSlot.find({ lot: lot._id })
    .select('slotNumber status lot createdAt updatedAt')
    .sort({ slotNumber: 1 })
    .lean();
  return res.status(200).json({ slots });
}

async function createLot(req, res) {
  const cleaned = cleanLotInput(req.body, false);
  if (cleaned.error) return res.status(400).json({ message: cleaned.error });

  const lot = await ParkingLot.create({
    ...cleaned.value,
    createdBy: req.user.id
  });
  return res.status(201).json({ message: 'Parking lot created.', lot });
}

async function updateLot(req, res) {
  if (!isValidObjectId(req.params.lotId)) {
    return res.status(400).json({ message: 'Invalid parking lot ID.' });
  }
  const cleaned = cleanLotInput(req.body, true);
  if (cleaned.error) return res.status(400).json({ message: cleaned.error });

  const lot = await ParkingLot.findOneAndUpdate(
    { _id: req.params.lotId, isActive: true },
    { $set: cleaned.value },
    { new: true, runValidators: true }
  );
  if (!lot) return res.status(404).json({ message: 'Active parking lot not found.' });
  return res.status(200).json({ message: 'Parking lot updated.', lot });
}

async function deactivateLot(req, res) {
  if (!isValidObjectId(req.params.lotId)) {
    return res.status(400).json({ message: 'Invalid parking lot ID.' });
  }
  const lot = await ParkingLot.findOneAndUpdate(
    { _id: req.params.lotId, isActive: true },
    { $set: { isActive: false } },
    { new: true }
  );
  if (!lot) return res.status(404).json({ message: 'Active parking lot not found.' });
  return res.status(200).json({ message: 'Parking lot deactivated.', lot });
}

function makeSlotNumbers(body) {
  if (Array.isArray(body.slots)) {
    if (body.slots.length < 1 || body.slots.length > 500) {
      return { error: 'Provide between 1 and 500 slot labels.' };
    }
    if (!body.slots.every((slot) =>
      typeof slot === 'string' && /^[A-Za-z0-9_-]{1,30}$/.test(slot.trim())
    )) {
      return { error: 'Each slot label may contain only letters, numbers, underscore, and hyphen.' };
    }
    const slots = body.slots.map((slot) => slot.trim().toUpperCase());
    if (new Set(slots).size !== slots.length) {
      return { error: 'Slot labels must be unique in the request.' };
    }
    return { value: slots };
  }

  const count = Number(body.count);
  const prefix = typeof body.prefix === 'string' && body.prefix.trim()
    ? body.prefix.trim().toUpperCase()
    : 'S';
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    return { error: 'Count must be an integer between 1 and 500.' };
  }
  if (!/^[A-Z0-9_-]{1,10}$/.test(prefix)) {
    return { error: 'Prefix may contain only letters, numbers, underscore, and hyphen.' };
  }
  const width = Math.max(3, String(count).length);
  const slots = [];
  for (let i = 1; i <= count; i += 1) {
    slots.push(prefix + '-' + String(i).padStart(width, '0'));
  }
  return { value: slots };
}

async function bulkCreateSlots(req, res) {
  if (!isValidObjectId(req.params.lotId)) {
    return res.status(400).json({ message: 'Invalid parking lot ID.' });
  }
  const lot = await ParkingLot.findOne({ _id: req.params.lotId, isActive: true }).select('_id');
  if (!lot) return res.status(404).json({ message: 'Active parking lot not found.' });

  const parsed = makeSlotNumbers(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });

  const existing = await ParkingSlot.find({
    lot: lot._id,
    slotNumber: { $in: parsed.value }
  }).select('slotNumber').lean();

  if (existing.length > 0) {
    return res.status(409).json({
      message: 'One or more slot labels already exist in this parking lot.',
      duplicates: existing.map((slot) => slot.slotNumber)
    });
  }

  try {
    const slots = await ParkingSlot.insertMany(
      parsed.value.map((slotNumber) => ({
        lot: lot._id,
        slotNumber,
        status: 'available'
      })),
      { ordered: true }
    );
    return res.status(201).json({
      message: 'Parking slots created.',
      count: slots.length,
      slots
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: 'A slot label already exists in this parking lot.' });
    }
    throw error;
  }
}

module.exports = {
  listLots,
  getLot,
  getLotSlots,
  createLot,
  updateLot,
  deactivateLot,
  bulkCreateSlots
};
