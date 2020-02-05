import { Schema, Types } from 'mongoose';
import { baseSchemaFields, schemaOptions } from './base.schema';
import { DbCollection } from '@aavantan-app/models';

const mongooseValidationErrorTransform = require('mongoose-validation-error-transform');

export const taskStatusSchema = new Schema({
  name: { type: String, required: [true, 'Status name is required'], text: true },
  projectId: { type: Types.ObjectId, ref: DbCollection.projects, required: [true, 'Project name is required'] },
  isCategory: { type: Boolean, default: false },
  categoryId: { type: Types.ObjectId, ref: DbCollection.taskStatus, default: null },
  ...baseSchemaFields
}, schemaOptions);

// options
taskStatusSchema
  .set('toObject', { virtuals: true })
  .set('toJSON', { virtuals: true });

// virtual
taskStatusSchema
  .virtual('category', {
    ref: DbCollection.taskStatus,
    localField: 'categoryId',
    foreignField: '_id',
    justOne: true
  });

taskStatusSchema
  .virtual('project', {
    ref: DbCollection.projects,
    localField: 'projectId',
    foreignField: '_id'
  });

// plugins
taskStatusSchema
  .plugin(mongooseValidationErrorTransform);