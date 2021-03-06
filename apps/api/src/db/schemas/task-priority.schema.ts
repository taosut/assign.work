import { Schema, Types } from 'mongoose';
import { commonSchemaFields, mongooseErrorTransformPluginOptions, schemaOptions } from './base.schema';
import { DbCollection } from '@aavantan-app/models';

const mongooseValidationErrorTransform = require('mongoose-validation-error-transform');

export const taskPrioritySchema = new Schema({
  name: { type: String, required: [true, 'Priority name is required'], text: true },
  color: { type: String, required: [true, 'Priority color is required'] },
  projectId: { type: Types.ObjectId, ref: DbCollection.projects, required: [true, 'Project name is required'] },
  description: { type: String },
  ...commonSchemaFields
}, schemaOptions);

// options
taskPrioritySchema
  .set('toObject', { virtuals: true })
  .set('toJSON', { virtuals: true });

// virtual
taskPrioritySchema
  .virtual('category', {
    ref: DbCollection.taskStatus,
    localField: 'categoryId',
    foreignField: '_id',
    justOne: true
  });

taskPrioritySchema
  .virtual('project', {
    ref: DbCollection.projects,
    localField: 'projectId',
    foreignField: '_id'
  });

// plugins
taskPrioritySchema
  .plugin(mongooseValidationErrorTransform, mongooseErrorTransformPluginOptions);
