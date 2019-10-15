import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { TypeaheadMatch } from 'ngx-bootstrap';
import { ValidationRegexService } from '../../services/validation-regex.service';
import { Organization, Project, ProjectTemplateEnum, User } from '@aavantan-app/models';
import { OrganizationService } from '../../services/organization.service';
import { GeneralService } from '../../services/general.service';
import { OrganizationQuery } from '../../../queries/organization/organization.query';
import { untilDestroyed } from 'ngx-take-until-destroy';


@Component({
  selector: 'aavantan-app-add-project',
  templateUrl: './add-project.component.html',
  styleUrls: ['./add-project.component.css']
})
export class AddProjectComponent implements OnInit, OnDestroy {
  @Input() public projectModalIsVisible: Boolean = false;
  @Output() toggleShow: EventEmitter<any> = new EventEmitter<any>();

  public orgForm: FormGroup;
  public projectForm: FormGroup;
  public collaboratorForm: FormGroup;
  public basicCurrent = 1;
  public swicthStepCurrent = 0;
  public modalTitle = 'Project Details';
  public radioValue = 'A';
  public selectedCollaborators: User[] = [];
  public selectedCollaborator: string;
  public response: any;

  public organizations: Organization[];
  public organizationCreationInProcess: boolean = false;

  public members: User[] = [
    { id: '1', firstName: 'Pradeep', emailId: 'pradeep@gmail.com', isEmailSent: true },
    { id: '2', firstName: 'Deep', emailId: 'deep@gmail.com' },
    { id: '3', firstName: 'Deep1', emailId: 'deep1@gmail.com' }
  ];

  constructor(private FB: FormBuilder, private validationRegexService: ValidationRegexService, private _organizationService: OrganizationService,
              private _generalService: GeneralService, private _organizationQuery: OrganizationQuery) {
  }

  ngOnInit() {
    this.organizations = this._generalService.user.organizations as Organization[];
    this.createFrom();

    // listen for organization creation
    this._organizationQuery.isCreateOrganizationSuccess$.pipe(untilDestroyed(this)).subscribe(res => {
      if (res && this.swicthStepCurrent === 0) {
        this.swicthStepCurrent++;
        this.changeContent();
      }
    });

    // listen for organization creation in process
    this._organizationQuery.isCreateOrganizationInProcess$.pipe(untilDestroyed(this)).subscribe(res => {
      this.organizationCreationInProcess = res;
    });
  }

  public createFrom() {
    this.projectForm = this.FB.group({
      name: [null, [Validators.required, Validators.pattern('^$|^[A-Za-z0-9]+')]],
      description: [null],
      organization: [null, Validators.required],
      template: [ProjectTemplateEnum.software, Validators.required],
      members: []
    });

    this.orgForm = this.FB.group({
      name: [null, [Validators.required, Validators.pattern('^$|^[A-Za-z0-9]+')]],
      description: [null, '']
    });

    this.collaboratorForm = this.FB.group({
      collaborators: ''
    });

  }

  public removeCollaborators(mem: User) {
    this.selectedCollaborators = this.selectedCollaborators.filter(item => item !== mem);
  }

  public typeaheadOnSelect(e: TypeaheadMatch): void {
    if (this.selectedCollaborators.filter(item => item.emailId === e.item.emailId).length === 0) {
      this.selectedCollaborators.push(e.item);
    }
    this.selectedCollaborator = null;
  }

  public createOrganization() {
    const organization: Organization = { ...this.orgForm.getRawValue() };
    organization.createdBy = this._generalService.user.id;
    this._organizationService.createOrganization(organization).subscribe();
  }

  public onKeydown(event) {
    if (event.key === 'Enter') {
      const member: User = {
        emailId: this.selectedCollaborator
      };
      this.response = this.validationRegexService.emailValidator(member.emailId);
      if (this.selectedCollaborators.filter(item => item.emailId === member.emailId).length === 0) {
        if (!this.response.invalidEmailAddress) {
          this.selectedCollaborators.push(member);
          this.selectedCollaborator = null;
        }
      }
    }
  }

  public selectOrg(item: Organization) {
    this.projectForm.get('organization').patchValue(item.id);
    this.next();
  }

  pre(): void {
    this.swicthStepCurrent -= 1;
    this.changeContent();
  }

  next(): void {
    if (this.swicthStepCurrent === 0) {
      // organization
      if (!this.organizations.length) {
        this.createOrganization();
        return;
      }
    }

    if (this.swicthStepCurrent === 2) {
      console.log(this.collaboratorForm.value);
    }
    this.swicthStepCurrent += 1;
    this.changeContent();
  }

  done(): void {
    this.toggleShow.emit();
  }

  basicModalHandleCancel() {
    this.toggleShow.emit();
  }

  changeContent(): void {
    switch (this.swicthStepCurrent) {
      case 0: {
        this.modalTitle = 'Organization';
        break;
      }
      case 1: {
        this.modalTitle = 'Project Details';
        break;
      }
      case 2: {
        this.modalTitle = 'Collaborators';
        break;
      }
      case 3: {
        this.modalTitle = 'Template';
        break;
      }
      default: {
        this.modalTitle = 'error';
      }
    }
    this.saveForm();
  }

  public saveForm() {
    const project: Project = { ...this.projectForm.getRawValue() };
    project.createdBy = this._generalService.user.id;
  }

  ngOnDestroy(): void {
  }

}
