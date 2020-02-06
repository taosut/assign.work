import { Schema } from 'mongoose';
import { DbCollection } from '@aavantan-app/models';
import { mongooseErrorTransformPluginOptions, schemaOptions } from './base.schema';

const mongooseValidationErrorTransform = require('mongoose-validation-error-transform');

const commentSchema = new Schema({
  comment: { type: String },
  createdById: { type: Schema.Types.ObjectId, ref: DbCollection.users, required: true },
  createdAt: { type: Date },
  updatedById: { type: Schema.Types.ObjectId, ref: DbCollection.users, required: false },
  updatedAt: { type: Date },
  attachments: [{ type: Schema.Types.ObjectId, ref: DbCollection.attachments }],
  isPinned: { type: Boolean, default: false }
});

commentSchema.virtual('attachmentsDetails', {
  ref: DbCollection.attachments,
  localField: 'attachments',
  foreignField: '_id'
});

commentSchema.virtual('createdBy', {
  ref: DbCollection.users,
  localField: 'createdById',
  foreignField: '_id'
});

export const taskSchema = new Schema({
  name: { type: String, required: [true, 'Please Add task title'] },
  displayName: { type: String },
  description: { type: String },
  projectId: {
    type: Schema.Types.ObjectId,
    ref: DbCollection.projects,
    required: [true, 'Please Select Project First!']
  },
  assigneeId: { type: Schema.Types.ObjectId, ref: DbCollection.users },
  watchers: [{ type: Schema.Types.ObjectId, ref: DbCollection.users, required: false }],
  attachments: [{ type: Schema.Types.ObjectId, ref: DbCollection.attachments }],
  // taskType: { type: String, required: [true, 'Please add task type'] },
  taskTypeId: { type: Schema.Types.ObjectId, ref: DbCollection.taskType },
  comments: [commentSchema],
  estimatedTime: { type: Number, default: 0 },
  remainingTime: { type: Number, default: 0 },
  overLoggedTime: { type: Number, default: 0 },
  totalLoggedTime: { type: Number, default: 0 },
  startedAt: { type: Date },
  finishedAt: { type: Date },
  // priority: { type: String },
  priorityId: { type: Schema.Types.ObjectId, ref: DbCollection.taskPriority },
  tags: [],
  url: { type: String },
  progress: { type: Number, default: 0 },
  overProgress: { type: Number, default: 0 },
  // status: { type: String },
  statusId: { type: Schema.Types.ObjectId, ref: DbCollection.taskStatus },
  sprintId: { type: Schema.Types.ObjectId, ref: DbCollection.sprint },
  dependentItemId: { type: Schema.Types.ObjectId, ref: DbCollection.tasks, required: false },
  relatedItemId: [{ type: Schema.Types.ObjectId, ref: DbCollection.tasks, required: false }],
  createdById: { type: Schema.Types.ObjectId, ref: DbCollection.users, required: true },
  updatedById: { type: Schema.Types.ObjectId, ref: DbCollection.users, required: false },
  isDeleted: { type: Boolean, default: false }
}, schemaOptions);

// options
taskSchema
  .set('toObject', { virtuals: true })
  .set('toJSON', {
    virtuals: true, transform: (doc, ret) => {
      ret.id = ret._id;
      return ret;
    }
  });

// virtual
taskSchema.virtual('project', {
  ref: DbCollection.projects,
  localField: 'projectId',
  foreignField: '_id'
});

taskSchema.virtual('assignee', {
  ref: DbCollection.users,
  localField: 'assigneeId',
  foreignField: '_id'
});

taskSchema.virtual('watchersDetails', {
  ref: DbCollection.tasks,
  localField: 'watchers',
  foreignField: '_id'
});

taskSchema.virtual('createdBy', {
  ref: DbCollection.users,
  localField: 'createdById',
  foreignField: '_id'
});

taskSchema.virtual('updatedBy', {
  ref: DbCollection.users,
  localField: 'updatedById',
  foreignField: '_id'
});

taskSchema.virtual('dependentItem', {
  ref: DbCollection.tasks,
  localField: 'dependentItemId',
  foreignField: '_id'
});

taskSchema.virtual('relatedItem', {
  ref: DbCollection.tasks,
  localField: 'relatedItemId',
  foreignField: '_id'
});

taskSchema.virtual('attachmentsDetails', {
  ref: DbCollection.attachments,
  localField: 'attachments',
  foreignField: '_id'
});

taskSchema.virtual('sprint', {
  ref: DbCollection.sprint,
  localField: 'sprintId',
  foreignField: '_id'
});

taskSchema.virtual('status', {
  ref: DbCollection.taskStatus,
  localField: 'statusId',
  foreignField: '_id'
});

taskSchema.virtual('priority', {
  ref: DbCollection.taskPriority,
  localField: 'priorityId',
  foreignField: '_id'
});

taskSchema.virtual('taskType', {
  ref: DbCollection.taskType,
  localField: 'taskTypeId',
  foreignField: '_id'
});

// plugins
taskSchema
  .plugin(mongooseValidationErrorTransform, mongooseErrorTransformPluginOptions);
