import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { BaseService } from './base.service';
import { DbCollection, Organization } from '@aavantan-app/models';
import { InjectModel } from '@nestjs/mongoose';
import { Document, Model } from 'mongoose';
import { UsersService } from './users.service';

@Injectable()
export class OrganizationService extends BaseService<Organization & Document> {
  constructor(
    @InjectModel(DbCollection.organizations) private readonly _organizationModel: Model<Organization & Document>,
    @Inject(forwardRef(() => UsersService)) private readonly _userService: UsersService
  ) {
    super(_organizationModel);
  }

  async createOrganization(organization: Organization) {
    const session = await this._organizationModel.db.startSession();
    session.startTransaction();
    try {
      const result = await this.create([new this._organizationModel(organization)], session);

      // update user
      const userDetails = await this._userService.findById(organization.createdBy as string);

      // if user have created first organization then set it to as current organization
      if (!userDetails.organizations.length) {
        userDetails.currentOrganizationId = result[0].id;
      }

      userDetails.organizations.push(result[0].id);
      await this._userService.updateUser(userDetails.id, userDetails, session);

      await session.commitTransaction();
      session.endSession();
      return result[0];
    } catch (e) {
      await session.abortTransaction();
      session.endSession();
      throw e;
    }
  }

  async deleteOrganization(id: string) {
    const session = await this._organizationModel.db.startSession();
    session.startTransaction();

    try {
      await this.delete(id);
      await session.commitTransaction();
      session.endSession();
      return 'Organization Deleted Successfully!';
    } catch (e) {
      await session.abortTransaction();
      session.endSession();
      throw e;
    }
  }

  async updateOrganization(id: string, organization: Partial<Organization>) {
    const session = await this._organizationModel.db.startSession();
    session.startTransaction();

    try {
      const result = await this.update(id, organization, session);
      await session.commitTransaction();
      session.endSession();
      return result;
    } catch (e) {
      await session.abortTransaction();
      session.endSession();
      throw e;
    }
  }
}
