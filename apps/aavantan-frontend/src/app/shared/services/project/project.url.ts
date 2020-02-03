import { createUrl } from '../apiUrls/base.url';

export const ProjectUrls = {
  base: `${createUrl('project')}`,
  getAllProject: `${createUrl('project/get-all')}`,
  switchProject: `${createUrl('project/switch-project')}`,
  updateProject: `${createUrl('project/:projectId')}`,
  updateTemplate: `${createUrl('project/update-template')}`,
  searchProject: `${createUrl('project/search')}`,
  addCollaborators: `${createUrl('project/:projectId/add-collaborators')}`,
  removeCollaborators: `${createUrl('project/:projectId/remove-collaborators')}`,
  resendInvitation: `${createUrl('project/resend-invitation')}`,
  addStage: `${createUrl('project/:projectId/add-stage')}`,
  removeStage: `${createUrl('project/:projectId/remove-stage/:stageId')}`,
  addStatus: `${createUrl('project/:projectId/add-status')}`,
  removeStatus: `${createUrl('project/:projectId/remove-status/:statusId')}`,
  addTaskType: `${createUrl('project/:projectId/add-task-type')}`,
  addPriority: `${createUrl('project/:projectId/add-priority')}`,
  removePriority: `${createUrl('project/:projectId/remove-priority/:priorityId')}`,
  removeTaskType: `${createUrl('project/:projectId/remove-task-type/:taskTypeId')}`,

  updateCapacity: `${createUrl('project/:projectId/update-working-capacity')}`,
  searchTags: `${createUrl('project/search-tags')}`

};
