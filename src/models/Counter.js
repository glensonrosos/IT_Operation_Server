import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  sequence: { type: Number, required: true, min: 0, default: 0 }
}, { timestamps: true });

export default mongoose.model('Counter', counterSchema);
