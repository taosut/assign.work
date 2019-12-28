import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../shared/services/auth.service';
import { AuthQuery } from '../queries/auth/auth.query';
import { Router } from '@angular/router';
import { Notice } from '../shared/interfaces/notice.type';
import { untilDestroyed } from 'ngx-take-until-destroy';
import { AuthService as SocialAuthService, GoogleLoginProvider } from 'angularx-social-login';


@Component({
  templateUrl: 'login.component.html',
  styleUrls: ['login.component.scss']
})

export class LoginComponent implements OnInit, OnDestroy {
  public loginForm: FormGroup;
  public loginInProcess = false;
  public responseMessage: Notice = {};
  public isSubmitted: boolean;
  public featuresList: any;

  constructor(private _authService: AuthService,
              private _authQuery: AuthQuery,
              private router: Router,
              private socialAuthService: SocialAuthService) {
  }

  ngOnInit(): void {
    this.loginForm = new FormGroup({
      emailId: new FormControl(null, [Validators.required]),
      password: new FormControl(null, [Validators.required])
    });

    this._authQuery.isLoginInProcess$.pipe(untilDestroyed(this)).subscribe(res => {
      this.loginInProcess = res;
    });

    this._authQuery.isLoginSuccess$.pipe(untilDestroyed(this)).subscribe(res => {
      if (this.isSubmitted && !res) {
        this.responseMessage.message = 'Invalid credentials';
        this.responseMessage.type = 'danger';
      }
    });

    this.socialAuthService.authState.subscribe((user) => {
      if (user) {
        this._authService.googleSignIn(user.idToken).subscribe();
      }
    });

    this.featuresList = [
      {
        title: 'Ant Design Title 1',
        description: 'wlsdfjldsfkj'
      },
      {
        title: 'Ant Design Title 2'
      },
      {
        title: 'Ant Design Title 3'
      },
      {
        title: 'Ant Design Title 4'
      }
    ];

  }

  loginWithGoogle() {
    this.socialAuthService.signIn(GoogleLoginProvider.PROVIDER_ID).then(result => {
      // this._authService.googleSignIn(result.idToken).subscribe();
    }).catch(err => {
      console.log(err);
    })
  }

  submitForm() {
    // const request = new UserLoginWithPasswordRequest();
    // request.emailId = this.loginForm.value.emailId;
    // request.password = hashSync(this.loginForm.value.password, 5);

    this.isSubmitted = true;
    this._authService.login(this.loginForm.value).subscribe();
  }

  ngOnDestroy(): void {
  }
}
