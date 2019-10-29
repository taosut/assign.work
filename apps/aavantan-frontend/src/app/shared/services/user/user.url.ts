import { createUrl } from '../apiUrls/base.url';

export const UserUrls = {
  profile: `${createUrl('user/profile')}`,
  getAll: `${createUrl('user')}`,
  switchProject: `${createUrl('switch-project')}`
};