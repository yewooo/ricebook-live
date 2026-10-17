import {inject} from '@angular/core';
import {CanActivateFn,Router} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {UsersService} from './services/users.service';
import {StateService} from './services/state.service';
export const authGuard:CanActivateFn=async()=>{
 const users=inject(UsersService),state=inject(StateService),router=inject(Router);
 try{const user=await firstValueFrom(users.getCurrentUser());state.setLoggedIn(user,user.catchPhrase,false);return true}
 catch{state.logout();return router.parseUrl('/')}
};
