import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  DbCollection,
  MemberTypes,
  User,
  UserLoginProviderEnum,
  UserStatus,
  UserLoginWithPasswordRequest
} from '@aavantan-app/models';
import { InjectModel } from '@nestjs/mongoose';
import { Document, Model } from 'mongoose';
import { UsersService } from '../users/users.service';
import { get, post, Response } from 'request';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectModel(DbCollection.users) private readonly _userModel: Model<User & Document>
  ) {
  }

  createToken(user: any) {
    return {
      access_token: this.jwtService.sign({ emailId: user.email, sub: user.id })
    };
  }


  async login(req: UserLoginWithPasswordRequest) {
    const user = await this._userModel.findOne({ emailId: req.emailId, password: req.password }).exec();
    if (user) {
      return {
        access_token: this.jwtService.sign({ emailId: user.emailId, sub: user.id })
      };
    } else {
      throw new UnauthorizedException('invalid email or password');
    }
  }

  async signUpWithPassword(user: User) {
    try {
      const model = new this._userModel(user);
      model.username = model.emailId;
      model.status = UserStatus.Active;
      model.lastLoginProvider = UserLoginProviderEnum.normal;
      model.memberType = MemberTypes.alien;

      const newUser = await model.save();
      const payload = { username: user.username, sub: newUser.username };
      return {
        access_token: this.jwtService.sign(payload)
      };
    } catch (e) {
      throw new HttpException(e, HttpStatus.BAD_REQUEST);
    }
  }

  async requestGoogleRedirectUri(): Promise<{ redirect_uri: string } | any> {
    const queryParams: string[] = [
      `client_id=786347906702-f24fedavhbjl61iebi8e3obhdftj452k.apps.googleusercontent.com`,
      `redirect_uri=http://localhost:4200/middleware`,
      `response_type=code`,
      `scope=https://www.googleapis.com/auth/plus.login https://www.googleapis.com/auth/plus.profile.emails.read`
    ];
    const redirect_uri = `${'https://accounts.google.com/o/oauth2/auth'}?${queryParams.join('&')}`;

    return {
      redirect_uri
    };
  }

  async googleSignIn(code: string): Promise<any> {
    return new Promise((resolve: Function, reject: Function) => {
      post({
        url: 'https://accounts.google.com/o/oauth2/token',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        form: {
          code,
          client_id: '786347906702-f24fedavhbjl61iebi8e3obhdftj452k.apps.googleusercontent.com',
          client_secret: 'ad1o3FgYmhCH6QeZYL5nr_LI',
          redirect_uri: 'http://localhost:4200/middleware',
          grant_type: 'authorization_code'
        }
      }, async (err: Error, res: Response, body: any) => {
        if (err) {
          return reject(err);
        }

        if (body.error) {
          return reject(body.error);
        }

        const { access_token } = JSON.parse(body);

        post({
          url: `http://localhost:3333/api/auth/google/token`,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          form: {
            access_token
          }
        }, async (err: Error, res: Response, body: any) => {
          if (err) {
            return reject(err);
          }

          if (body.error) {
            return reject(body.error);
          }

          resolve(body);
        });
      });
    });
  }

}