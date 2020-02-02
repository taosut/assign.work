import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { SettingsComponent } from './settings.component';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../shared/shared.module';
import { SortableModule, TypeaheadModule } from 'ngx-bootstrap';
import { ColorPickerModule } from 'ngx-color-picker';

const routes: Routes = [
  { path: '', component: SettingsComponent }
];

@NgModule({
  imports: [
    RouterModule.forChild(routes),
    CommonModule,
    SharedModule,
    TypeaheadModule,
    SortableModule,
    ColorPickerModule
  ],
  exports: [],
  declarations: [
    SettingsComponent,
    AddStatusComponent
  ]
})
export class SettingsModule {
}
