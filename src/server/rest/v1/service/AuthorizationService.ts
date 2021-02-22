import { Action, AuthorizationFilter, Entity } from '../../../../types/Authorization';
import { HttpSiteAssignUsersRequest, HttpSiteRequest, HttpSiteUsersRequest } from '../../../../types/requests/HttpSiteRequest';
import { HttpUserRequest, HttpUserSitesRequest, HttpUsersRequest } from '../../../../types/requests/HttpUserRequest';
import User, { UserRole } from '../../../../types/User';

import AppAuthError from '../../../../exception/AppAuthError';
import Authorizations from '../../../../authorization/Authorizations';
import Constants from '../../../../utils/Constants';
import { HTTPAuthError } from '../../../../types/HTTPError';
import { ServerAction } from '../../../../types/Server';
import Site from '../../../../types/Site';
import SiteStorage from '../../../../storage/mongodb/SiteStorage';
import Tenant from '../../../../types/Tenant';
import UserStorage from '../../../../storage/mongodb/UserStorage';
import UserToken from '../../../../types/UserToken';
import Utils from '../../../../utils/Utils';

const MODULE_NAME = 'AuthorizationService';

export default class AuthorizationService {
  public static async checkAndGetSiteAuthorizationFilters(
    tenant: Tenant, userToken: UserToken, filteredRequest: HttpSiteRequest): Promise<AuthorizationFilter> {
    const authorizationFilters: AuthorizationFilter = {
      filters: {},
      projectFields: [
        'id', 'name', 'issuer', 'image', 'address', 'companyID', 'company.name', 'autoUserSiteAssignment', 'public'
      ],
      authorized: userToken.role === UserRole.ADMIN,
    };
    // Check Projection
    if (!Utils.isEmptyArray(filteredRequest.ProjectFields)) {
      authorizationFilters.projectFields = authorizationFilters.projectFields.filter((projectField) => filteredRequest.ProjectFields.includes(projectField));
    }
    // Not an Admin?
    if (userToken.role !== UserRole.ADMIN) {
      // Get Site IDs from Site Admin flag
      const siteIDs = await AuthorizationService.getAssignedSiteIDs(tenant.id, userToken, filteredRequest.ID);
      if (Utils.isEmptyArray(siteIDs)) {
        throw new AppAuthError({
          errorCode: HTTPAuthError.ERROR,
          user: userToken,
          action: Action.READ, entity: Entity.SITE,
          module: MODULE_NAME, method: 'checkAndGetSiteAuthorizationFilters',
        });
      }
    }
    return authorizationFilters;
  }

  public static async addSitesAuthorizations(tenant: Tenant, userToken: UserToken, sites: Site[]): Promise<void> {
    // Get Site Admins
    const { siteAdminIDs, siteOwnerIDs } = await AuthorizationService.getSiteAdminOwnerIDs(tenant, userToken);
    // Set to user
    userToken.sitesAdmin = siteAdminIDs;
    userToken.sitesOwner = siteOwnerIDs;
    // Enrich
    for (const site of sites) {
      site.canRead = Authorizations.canReadSite(userToken);
      site.canUpdate = Authorizations.canUpdateSite(userToken, site.id);
      site.canDelete = Authorizations.canDeleteSite(userToken, site.id);
    }
  }

  public static async checkAndGetSitesAuthorizationFilters(
    tenant: Tenant, userToken: UserToken, filteredRequest: HttpSiteUsersRequest): Promise<AuthorizationFilter> {
    const authorizationFilters: AuthorizationFilter = {
      filters: {},
      projectFields: [
        'id', 'name', 'address', 'companyID', 'company.name', 'autoUserSiteAssignment', 'issuer',
        'autoUserSiteAssignment', 'distanceMeters', 'public', 'createdOn', 'lastChangedOn',
      ],
      authorized: userToken.role === UserRole.ADMIN,
    };
    // Add user info
    if (Authorizations.canListUsers(userToken)) {
      authorizationFilters.projectFields.push(
        'createdBy.name', 'createdBy.firstName', 'lastChangedBy.name', 'lastChangedBy.firstName');
    }
    // Check Projection
    if (!Utils.isEmptyArray(filteredRequest.ProjectFields)) {
      authorizationFilters.projectFields = authorizationFilters.projectFields.filter((projectField) => filteredRequest.ProjectFields.includes(projectField));
    }
    // Not an Admin?
    if (userToken.role !== UserRole.ADMIN) {
      // Get Site IDs from Site Admin flag
      const siteIDs = await AuthorizationService.getAssignedSiteIDs(tenant.id, userToken);
      if (!Utils.isEmptyArray(siteIDs)) {
        // Force the filter
        authorizationFilters.filters.siteIDs = siteIDs;
        // Check if filter is provided
        if (filteredRequest.SiteID) {
          const filteredSiteIDs = filteredRequest.SiteID.split('|');
          // Override
          authorizationFilters.filters.siteIDs = filteredSiteIDs.filter(
            (siteID) => authorizationFilters.filters.siteIDs.includes(siteID));
        }
      }
      if (!Utils.isEmptyArray(authorizationFilters.filters.siteIDs)) {
        authorizationFilters.authorized = true;
      }
    }
    return authorizationFilters;
  }

  public static async checkAndGetSiteUsersAuthorizationFilters(
    tenant: Tenant, userToken: UserToken, filteredRequest: HttpSiteUsersRequest): Promise<AuthorizationFilter> {
    const authorizationFilters: AuthorizationFilter = {
      filters: {},
      projectFields: [
        'user.id', 'user.name', 'user.firstName', 'user.email', 'user.role', 'siteAdmin', 'siteOwner', 'siteID'
      ],
      authorized: userToken.role === UserRole.ADMIN,
    };
    // Check projection
    if (!Utils.isEmptyArray(filteredRequest.ProjectFields)) {
      authorizationFilters.projectFields = authorizationFilters.projectFields.filter((projectField) => filteredRequest.ProjectFields.includes(projectField));
    }
    // Not an Admin?
    if (userToken.role !== UserRole.ADMIN) {
      // Get Site IDs from Site Admin flag
      const siteIDs = await AuthorizationService.getSiteAdminSiteIDs(tenant.id, userToken);
      if (!Utils.isEmptyArray(siteIDs)) {
        // Force the filter
        authorizationFilters.filters.siteIDs = siteIDs;
        // Check if filter is provided
        if (filteredRequest.SiteID) {
          const filteredSiteIDs = filteredRequest.SiteID.split('|');
          // Override
          authorizationFilters.filters.siteIDs = filteredSiteIDs.filter(
            (siteID) => authorizationFilters.filters.siteIDs.includes(siteID));
        }
      }
      if (!Utils.isEmptyArray(authorizationFilters.filters.siteIDs)) {
        authorizationFilters.authorized = true;
      }
    }
    return authorizationFilters;
  }

  public static async checkAndGetUserSitesAuthorizationFilters(
    tenant: Tenant, userToken: UserToken, filteredRequest: HttpUserSitesRequest): Promise<AuthorizationFilter> {
    const authorizationFilters: AuthorizationFilter = {
      filters: {},
      projectFields: [
        'site.id', 'site.name', 'site.address.city', 'site.address.country', 'siteAdmin', 'siteOwner', 'userID'
      ],
      authorized: userToken.role === UserRole.ADMIN,
    };
    // Check projection
    if (!Utils.isEmptyArray(filteredRequest.ProjectFields)) {
      authorizationFilters.projectFields = authorizationFilters.projectFields.filter((projectField) => filteredRequest.ProjectFields.includes(projectField));
    }
    // Not an Admin?
    if (userToken.role !== UserRole.ADMIN) {
      // Get Site IDs from Site Admin flag
      const siteIDs = await AuthorizationService.getSiteAdminSiteIDs(tenant.id, userToken);
      if (!Utils.isEmptyArray(siteIDs)) {
        // Force the filter
        authorizationFilters.filters.siteIDs = siteIDs;
      }
      if (!Utils.isEmptyArray(authorizationFilters.filters.siteIDs)) {
        authorizationFilters.authorized = true;
      }
    }
    return authorizationFilters;
  }

  public static async checkAndAssignSiteUsersAuthorizationFilters(
    tenant: Tenant, action: ServerAction, userToken: UserToken, filteredRequest: HttpSiteAssignUsersRequest): Promise<AuthorizationFilter> {
    const authorizationFilters: AuthorizationFilter = {
      filters: {},
      projectFields: [
        'user.id', 'user.name', 'user.firstName', 'user.email', 'user.role', 'siteAdmin', 'siteOwner', 'siteID'
      ],
      authorized: userToken.role === UserRole.ADMIN,
    };
    // Check projection
    if (!Utils.isEmptyArray(filteredRequest.ProjectFields)) {
      authorizationFilters.projectFields = authorizationFilters.projectFields.filter((projectField) => filteredRequest.ProjectFields.includes(projectField));
    }
    // Not an Admin?
    if (userToken.role !== UserRole.ADMIN) {
      // Get Site IDs from Site Admin flag
      const siteIDs = await AuthorizationService.getSiteAdminSiteIDs(tenant.id, userToken);
      // Get User IDs from Site Admin flag
      if (!Utils.isEmptyArray(siteIDs)) {
        // Check Site ID
        if (siteIDs.includes(filteredRequest.siteID)) {
          // Site Authorized, now check users
          if (!Utils.isEmptyArray(filteredRequest.userIDs)) {
            let foundInvalidUserID = false;
            // Get authorized User IDs
            const userIDs = await AuthorizationService.getAssignedUsersIDs(tenant.id, filteredRequest.siteID);
            // Check
            for (const userID of filteredRequest.userIDs) {
              if (!userIDs.includes(userID)) {
                foundInvalidUserID = true;
                break;
              }
            }
            if (!foundInvalidUserID) {
              authorizationFilters.authorized = true;
            }
          }
        }
      }
      if (!authorizationFilters.authorized) {
        throw new AppAuthError({
          errorCode: HTTPAuthError.ERROR,
          user: userToken,
          action: action === ServerAction.ADD_USERS_TO_SITE ? Action.ASSIGN : Action.UNASSIGN,
          entity: Entity.USERS_SITES,
          module: MODULE_NAME, method: 'checkAndAssignSiteUsersAuthorizationFilters'
        });
      }
    }
    return authorizationFilters;
  }

  public static async checkAndGetUsersInErrorAuthorizationFilters(
    tenant: Tenant, userToken: UserToken, filteredRequest: HttpUsersRequest): Promise<AuthorizationFilter> {
    const authorizationFilters: AuthorizationFilter = {
      filters: {},
      projectFields: [
        'id', 'name', 'firstName', 'email', 'role', 'status', 'issuer',
        'createdOn', 'lastChangedOn', 'errorCodeDetails', 'errorCode'
      ]
    };
    // Check projection
    if (!Utils.isEmptyArray(filteredRequest.ProjectFields)) {
      authorizationFilters.projectFields = authorizationFilters.projectFields.filter((projectField) => filteredRequest.ProjectFields.includes(projectField));
    }
    // Get from users
    const usersAuthorizationFilters = await AuthorizationService.checkAndGetUsersAuthorizationFilters(tenant, userToken, filteredRequest);
    // Override
    authorizationFilters.authorized = usersAuthorizationFilters.authorized;
    authorizationFilters.filters = usersAuthorizationFilters.filters;
    return authorizationFilters;
  }

  public static addUsersAuthorizations(tenant: Tenant, userToken: UserToken, users: User[]): void {
    // Enrich
    for (const user of users) {
      user.canRead = Authorizations.canReadUser(userToken, user.id);
      user.canUpdate = Authorizations.canUpdateUser(userToken, user.id);
      user.canDelete = Authorizations.canDeleteUser(userToken, user.id);
    }
  }

  public static async checkAndGetUsersAuthorizationFilters(
    tenant: Tenant, userToken: UserToken, filteredRequest: HttpUsersRequest): Promise<AuthorizationFilter> {
    const authorizationFilters: AuthorizationFilter = {
      filters: {},
      projectFields: [
        'id', 'name', 'firstName', 'email', 'role', 'status', 'issuer', 'createdOn', 'createdBy',
        'lastChangedOn', 'lastChangedBy', 'eulaAcceptedOn', 'eulaAcceptedVersion', 'locale',
        'billingData.customerID', 'billingData.lastChangedOn'
      ]
    };
    // Check projection
    if (!Utils.isEmptyArray(filteredRequest.ProjectFields)) {
      authorizationFilters.projectFields = authorizationFilters.projectFields.filter((projectField) => filteredRequest.ProjectFields.includes(projectField));
    }
    // Get from users
    if (userToken.role === UserRole.BASIC) {
      // Must be Site Admin as only Basic User with site admin role can access list of users
      const siteIDs = await AuthorizationService.getSiteAdminSiteIDs(tenant.id, userToken);
      // Force the filter
      if (!Utils.isEmptyArray(siteIDs)) {
        authorizationFilters.filters.siteIDs = siteIDs;
      }
      // Check if filter is provided
      if (filteredRequest.SiteID) {
        const filteredSiteIDs = filteredRequest.SiteID.split('|');
        // Override
        authorizationFilters.filters.siteIDs = filteredSiteIDs.filter(
          (siteID) => authorizationFilters.filters.siteIDs.includes(siteID));
      }
    }
    return authorizationFilters;
  }

  public static async checkAndGetUserAuthorizationFilters(
    tenant: Tenant, userToken: UserToken, filteredRequest: HttpUserRequest): Promise<AuthorizationFilter> {
    const authorizationFilters: AuthorizationFilter = {
      filters: {},
      projectFields:       [
        'id', 'name', 'firstName', 'email', 'role', 'status', 'issuer', 'locale', 'deleted', 'plateID',
        'notificationsActive', 'notifications', 'phone', 'mobile', 'iNumber', 'costCenter', 'address'
      ]
    };
    // Check projection
    if (!Utils.isEmptyArray(filteredRequest.ProjectFields)) {
      authorizationFilters.projectFields = authorizationFilters.projectFields.filter((projectField) => filteredRequest.ProjectFields.includes(projectField));
    }
    // Not an Admin?
    if (userToken.role !== UserRole.ADMIN) {
      // Must be Site Admin as only Basic User with site admin role can access list of users
      const siteIDs = await AuthorizationService.getSiteAdminSiteIDs(tenant.id, userToken);
      // Force the filter
      if (!Utils.isEmptyArray(siteIDs)) {
        authorizationFilters.filters.siteIDs = siteIDs;
      }
    }
    return authorizationFilters;
  }

  private static async getSiteAdminSiteIDs(tenantID: string, userToken: UserToken): Promise<string[]> {
    // Get the Sites where the user is Site Admin
    const userSites = await UserStorage.getUserSites(tenantID,
      {
        userID: userToken.id,
        siteAdmin: true
      }, Constants.DB_PARAMS_MAX_LIMIT,
      [ 'siteID' ]
    );
    return userSites.result.map((userSite) => userSite.siteID);
  }

  private static async getAssignedSiteIDs(tenantID: string, userToken: UserToken, siteID?: string): Promise<string[]> {
    // Get the Sites where the user is Site Admin
    const sites = await SiteStorage.getSites(tenantID,
      {
        siteIDs: siteID ? [ siteID ] : null,
        userID: userToken.id,
        issuer: true,
      }, Constants.DB_PARAMS_MAX_LIMIT,
      [ 'id' ]
    );
    return sites.result.map((site) => site.id);
  }

  private static async getAssignedUsersIDs(tenantID: string, siteID: string): Promise<string[]> {
    // Get the Sites where the user is Site Admin
    const users = await UserStorage.getUsers(tenantID,
      {
        siteIDs: [ siteID ],
        issuer: true,
      }, Constants.DB_PARAMS_MAX_LIMIT,
      [ 'id' ]
    );
    return users.result.map((user) => user.id);
  }

  private static async getSiteAdminOwnerIDs(tenant: Tenant, userToken: UserToken): Promise<{ siteAdminIDs: string[]; siteOwnerIDs: string[]; }> {
    const siteAdminIDs: string[] = [];
    const siteOwnerIDs: string[] = [];
    const userSites = await UserStorage.getUserSites(tenant.id, { userID: userToken.id }, Constants.DB_PARAMS_MAX_LIMIT);
    for (const userSite of userSites.result) {
      if (userSite.siteAdmin) {
        siteAdminIDs.push(userSite.siteID);
      }
      if (userSite.siteOwner) {
        siteOwnerIDs.push(userSite.siteID);
      }
    }
    return {
      siteAdminIDs,
      siteOwnerIDs
    };
  }
}
