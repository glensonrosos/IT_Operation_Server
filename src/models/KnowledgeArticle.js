import mongoose from 'mongoose';

const knowledgeArticleSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  summary: { type: String, trim: true, maxlength: 500, default: '' },
  content: { type: String, required: true, trim: true, maxlength: 30000 },
  category: { type: String, trim: true, maxlength: 100, default: '' },
  tags: { type: [String], default: [] },
  status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT', index: true },
  publishedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

knowledgeArticleSchema.index({ title: 1, category: 1, status: 1 });
knowledgeArticleSchema.index({ tags: 1, status: 1 });

export default mongoose.model('KnowledgeArticle', knowledgeArticleSchema);
