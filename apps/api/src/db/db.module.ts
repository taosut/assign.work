import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DbCollection } from '@aavantan-app/models';
import { userSchema } from './schemas/users.schema';
import { projectSchema } from './schemas/project.schema';
import { organizationSchema } from './schemas/organization.schema';
import { taskSchema } from './schemas/task.schema';
import { taskHistorySchema } from './schemas/task-history.schema';
import { attachmentSchema } from '../attachment/attachment.schema';
import { taskTimeLogSchema } from './schemas/task-time-log.schema';
import { sprintSchema } from './schemas/sprint.schema';
import { invitationSchema } from './schemas/invitations.schema';
import { resetPasswordSchema } from './schemas/reset-password.schema';
import { workflowSchema } from './schemas/workflow.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{
      name: DbCollection.users,
      schema: userSchema,
      collection: DbCollection.users
    }, {
      name: DbCollection.projects,
      schema: projectSchema,
      collection: DbCollection.projects
    }, {
      name: DbCollection.organizations,
      schema: organizationSchema,
      collection: DbCollection.organizations
    }, {
      name: DbCollection.tasks,
      schema: taskSchema,
      collection: DbCollection.tasks
    }, {
      name: DbCollection.taskHistory,
      schema: taskHistorySchema,
      collection: DbCollection.taskHistory
    }, {
      name: DbCollection.attachments,
      schema: attachmentSchema,
      collection: DbCollection.attachments
    }, {
      name: DbCollection.taskTimeLog,
      schema: taskTimeLogSchema,
      collection: DbCollection.taskTimeLog
    }, {
      name: DbCollection.sprint,
      schema: sprintSchema,
      collection: DbCollection.sprint
    }, {
      name: DbCollection.invitations,
      schema: invitationSchema,
      collection: DbCollection.invitations
    }, {
      name: DbCollection.resetPassword,
      schema: resetPasswordSchema,
      collection: DbCollection.resetPassword
    }, {
      name: DbCollection.workflow,
      schema: workflowSchema,
      collection: DbCollection.workflow
    }])
  ],
  exports: [
    MongooseModule
  ]
})
export class DbModule {

}
