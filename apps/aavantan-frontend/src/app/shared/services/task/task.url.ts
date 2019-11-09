import { createUrl } from '../apiUrls/base.url';

export const TaskUrls = {
  base: createUrl('task'),

  addTask: createUrl('task/add'),

  getAllTask: createUrl('task/get-all'),
  update: createUrl('task/update'),
  getTask: `${createUrl('task/get-task')}`,
  filterTask: `${createUrl('task/filter')}`,

  addComment: `${createUrl('task/add-comment')}`,
  getComments: `${createUrl('task/get-comments')}`,
  updateComment: `${createUrl('task/update-comment')}`,

  pinComment: `${createUrl('task/pin-comment')}`,
  attachement: `${createUrl('task/add')}`,

  getHistory: `${createUrl('task-history')}`,
  addTimelog: `${createUrl('task/addtimelog/:taskId')}`,
};
