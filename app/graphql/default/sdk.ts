// THIS FILE IS GENERATED, DO NOT EDIT!
/* eslint-disable eslint-comments/no-unlimited-disable */
/* tslint:disable */
/* eslint-disable */
/* prettier-ignore */
import type * as Types from '#graphql/client';

import type { ExecutionResult } from 'graphql';

export const GetNotificationAnalyticsDocument = /*#__PURE__*/ `
    query getNotificationAnalytics($notificationId: ID!) {
  getNotificationAnalytics(notificationId: $notificationId) {
    notificationId
    sentCount
    deliveredCount
    openedCount
    clickedCount
    deliveryRate
    openRate
    clickRate
    platformBreakdown {
      platform
      sent
      delivered
      opened
      clicked
      avgDeliveryTime
      avgOpenTime
    }
  }
}
    `;
export const GetEngagementMetricsDocument = /*#__PURE__*/ `
    query getEngagementMetrics($appId: ID!, $timeRange: String) {
  getEngagementMetrics(appId: $appId, timeRange: $timeRange) {
    totalNotifications
    totalSent
    totalDelivered
    totalOpened
    totalClicked
    overallDeliveryRate
    overallOpenRate
    overallClickRate
    platformBreakdown {
      platform
      sent
      delivered
      opened
      clicked
      avgDeliveryTime
      avgOpenTime
    }
  }
}
    `;
export const CreateAppDocument = /*#__PURE__*/ `
    mutation createApp($input: CreateAppInput!) {
  createApp(input: $input) {
    id
    name
    slug
    description
    isActive
    apiKey
    createdAt
    updatedAt
  }
}
    `;
export const UpdateAppDocument = /*#__PURE__*/ `
    mutation updateApp($id: ID!, $input: UpdateAppInput!) {
  updateApp(id: $id, input: $input) {
    id
    name
    slug
    description
    isActive
    fcmProjectId
    apnsKeyId
    apnsTeamId
    vapidSubject
    vapidPublicKey
    updatedAt
  }
}
    `;
export const DeleteAppDocument = /*#__PURE__*/ `
    mutation deleteApp($id: ID!) {
  deleteApp(id: $id)
}
    `;
export const RegenerateApiKeyDocument = /*#__PURE__*/ `
    mutation regenerateApiKey($id: ID!) {
  regenerateApiKey(id: $id) {
    id
    apiKey
    updatedAt
  }
}
    `;
export const ConfigureApNsDocument = /*#__PURE__*/ `
    mutation configureAPNs($id: ID!, $input: ConfigureAPNsInput!) {
  configureAPNs(id: $id, input: $input) {
    id
    apnsKeyId
    apnsTeamId
    updatedAt
  }
}
    `;
export const ConfigureFcmDocument = /*#__PURE__*/ `
    mutation configureFCM($id: ID!, $input: ConfigureFCMInput!) {
  configureFCM(id: $id, input: $input) {
    id
    fcmProjectId
    updatedAt
  }
}
    `;
export const ConfigureWebPushDocument = /*#__PURE__*/ `
    mutation configureWebPush($id: ID!, $input: ConfigureWebPushInput!) {
  configureWebPush(id: $id, input: $input) {
    id
    vapidSubject
    vapidPublicKey
    updatedAt
  }
}
    `;
export const AppsDocument = /*#__PURE__*/ `
    query apps {
  apps {
    id
    name
    slug
    description
    isActive
    apiKey
    fcmProjectId
    fcmServiceAccount
    apnsKeyId
    apnsTeamId
    apnsPrivateKey
    bundleId
    vapidSubject
    vapidPublicKey
    vapidPrivateKey
    createdAt
    updatedAt
    stats {
      totalDevices
      activeDevices
      newDevicesToday
      sentToday
      deliveryRate
      apiCalls
    }
  }
}
    `;
export const AppDocument = /*#__PURE__*/ `
    query app($id: ID!) {
  app(id: $id) {
    id
    name
    slug
    description
    isActive
    apiKey
    fcmProjectId
    fcmServiceAccount
    apnsKeyId
    apnsTeamId
    apnsPrivateKey
    bundleId
    vapidSubject
    vapidPublicKey
    vapidPrivateKey
    createdAt
    updatedAt
    stats {
      totalDevices
      activeDevices
      newDevicesToday
      sentToday
      deliveryRate
      apiCalls
    }
  }
}
    `;
export const AppBySlugDocument = /*#__PURE__*/ `
    query appBySlug($slug: String!) {
  appBySlug(slug: $slug) {
    id
    name
    slug
    description
    isActive
    apiKey
    createdAt
    updatedAt
  }
}
    `;
export const AppExistsDocument = /*#__PURE__*/ `
    query appExists($slug: String!) {
  appExists(slug: $slug)
}
    `;
export const GenerateVapidKeysDocument = /*#__PURE__*/ `
    query generateVapidKeys {
  generateVapidKeys {
    publicKey
    privateKey
  }
}
    `;
export const CreateAutomationDocument = /*#__PURE__*/ `
    mutation createAutomation($input: CreateAutomationInput!) {
  createAutomation(input: $input) {
    id
    appId
    name
    description
    type
    isActive
    notificationTemplates {
      title
      body
      data
      icon
      imageUrl
      clickAction
      sound
      badge
      delayMinutes
    }
    frequency
    timeOfDay
    daysOfWeek
    startDate
    endDate
    nextRunAt
    createdAt
    updatedAt
  }
}
    `;
export const UpdateAutomationDocument = /*#__PURE__*/ `
    mutation updateAutomation($id: ID!, $input: UpdateAutomationInput!) {
  updateAutomation(id: $id, input: $input) {
    id
    appId
    name
    description
    type
    isActive
    notificationTemplates {
      title
      body
      data
      icon
      imageUrl
      clickAction
      sound
      badge
      delayMinutes
    }
    frequency
    timeOfDay
    daysOfWeek
    startDate
    endDate
    nextRunAt
    createdAt
    updatedAt
  }
}
    `;
export const DeleteAutomationDocument = /*#__PURE__*/ `
    mutation deleteAutomation($id: ID!) {
  deleteAutomation(id: $id)
}
    `;
export const ToggleAutomationDocument = /*#__PURE__*/ `
    mutation toggleAutomation($id: ID!) {
  toggleAutomation(id: $id) {
    id
    isActive
  }
}
    `;
export const AutomationsDocument = /*#__PURE__*/ `
    query automations($appId: ID) {
  automations(appId: $appId) {
    id
    appId
    name
    description
    type
    isActive
    notificationTemplates {
      title
      body
      data
      icon
      imageUrl
      clickAction
      sound
      badge
      delayMinutes
    }
    frequency
    timeOfDay
    daysOfWeek
    startDate
    endDate
    nextRunAt
    stats {
      sent
      delivered
      failed
      clicks
      ctr
      deliveryRate
    }
    createdAt
    updatedAt
  }
}
    `;
export const AutomationDocument = /*#__PURE__*/ `
    query automation($id: ID!) {
  automation(id: $id) {
    id
    appId
    name
    description
    type
    isActive
    notificationTemplates {
      title
      body
      data
      icon
      imageUrl
      clickAction
      sound
      badge
      delayMinutes
    }
    frequency
    timeOfDay
    daysOfWeek
    startDate
    endDate
    nextRunAt
    createdAt
    updatedAt
  }
}
    `;
export const RegisterDeviceDocument = /*#__PURE__*/ `
    mutation registerDevice($input: RegisterDeviceInput!) {
  registerDevice(input: $input) {
    id
    appId
    token
    platform
    userId
    status
    metadata
    lastSeenAt
    createdAt
    updatedAt
  }
}
    `;
export const UpdateDeviceDocument = /*#__PURE__*/ `
    mutation updateDevice($id: ID!, $input: UpdateDeviceInput!) {
  updateDevice(id: $id, input: $input) {
    id
    appId
    token
    platform
    userId
    status
    metadata
    lastSeenAt
    updatedAt
  }
}
    `;
export const DeleteDeviceDocument = /*#__PURE__*/ `
    mutation deleteDevice($id: ID!) {
  deleteDevice(id: $id)
}
    `;
export const DevicesDocument = /*#__PURE__*/ `
    query devices($appId: ID) {
  devices(appId: $appId) {
    id
    appId
    token
    category
    platform
    userId
    status
    metadata
    lastSeenAt
    createdAt
    updatedAt
  }
}
    `;
export const DeviceDocument = /*#__PURE__*/ `
    query device($id: ID!) {
  device(id: $id) {
    id
    appId
    token
    category
    platform
    userId
    status
    metadata
    lastSeenAt
    createdAt
    updatedAt
  }
}
    `;
export const DeviceByTokenDocument = /*#__PURE__*/ `
    query deviceByToken($token: String!) {
  deviceByToken(token: $token) {
    id
    appId
    token
    category
    platform
    userId
    status
    metadata
    lastSeenAt
    createdAt
    updatedAt
  }
}
    `;
export const SendNotificationDocument = /*#__PURE__*/ `
    mutation sendNotification($input: SendNotificationInput!) {
  sendNotification(input: $input) {
    id
    appId
    title
    body
    data
    badge
    sound
    clickAction
    imageUrl
    icon
    targetDevices
    platforms
    scheduledAt
    status
    totalTargets
    totalSent
    totalDelivered
    totalFailed
    totalClicked
    createdAt
    updatedAt
    sentAt
  }
}
    `;
export const ScheduleNotificationDocument = /*#__PURE__*/ `
    mutation scheduleNotification($input: SendNotificationInput!) {
  scheduleNotification(input: $input) {
    id
    appId
    title
    body
    data
    badge
    sound
    clickAction
    imageUrl
    targetDevices
    platforms
    scheduledAt
    status
    totalTargets
    totalSent
    totalDelivered
    totalFailed
    totalClicked
    createdAt
    updatedAt
    sentAt
  }
}
    `;
export const NotificationsDocument = /*#__PURE__*/ `
    query notifications($appId: ID, $filter: NotificationFilterInput) {
  notifications(appId: $appId, filter: $filter) {
    id
    appId
    title
    body
    data
    badge
    sound
    clickAction
    icon
    imageUrl
    targetDevices
    platforms
    scheduledAt
    status
    totalTargets
    totalSent
    totalDelivered
    totalFailed
    totalClicked
    automationId
    createdAt
    updatedAt
    sentAt
  }
}
    `;
export const NotificationDocument = /*#__PURE__*/ `
    query notification($id: ID!) {
  notification(id: $id) {
    id
    appId
    title
    body
    data
    badge
    sound
    clickAction
    imageUrl
    targetDevices
    platforms
    scheduledAt
    status
    totalTargets
    totalSent
    totalDelivered
    totalFailed
    totalClicked
    automationId
    createdAt
    updatedAt
    sentAt
    deliveryLogs {
      id
      deviceId
      status
      errorMessage
      createdAt
      clickedAt
    }
  }
}
    `;
export const DeliveryLogsDocument = /*#__PURE__*/ `
    query deliveryLogs($notificationId: ID) {
  deliveryLogs(notificationId: $notificationId) {
    id
    notificationId
    deviceId
    status
    errorMessage
    clickedAt
    createdAt
    updatedAt
  }
}
    `;
export const DashboardStatsDocument = /*#__PURE__*/ `
    query dashboardStats {
  dashboardStats {
    totalApps
    activeDevices
    notificationsSent
    deliveryRate
  }
}
    `;
export type Requester<C = {}, E = unknown> = <R, V>(doc: string, vars?: V, options?: C) => Promise<ExecutionResult<R, E>> | AsyncIterable<ExecutionResult<R, E>>
export function getSdk<C, E>(requester: Requester<C, E>) {
  return {
    getNotificationAnalytics(variables: Types.GetNotificationAnalyticsQueryVariables, options?: C): Promise<ExecutionResult<Types.GetNotificationAnalyticsQuery, E>> {
      return requester<Types.GetNotificationAnalyticsQuery, Types.GetNotificationAnalyticsQueryVariables>(GetNotificationAnalyticsDocument, variables, options) as Promise<ExecutionResult<Types.GetNotificationAnalyticsQuery, E>>;
    },
    getEngagementMetrics(variables: Types.GetEngagementMetricsQueryVariables, options?: C): Promise<ExecutionResult<Types.GetEngagementMetricsQuery, E>> {
      return requester<Types.GetEngagementMetricsQuery, Types.GetEngagementMetricsQueryVariables>(GetEngagementMetricsDocument, variables, options) as Promise<ExecutionResult<Types.GetEngagementMetricsQuery, E>>;
    },
    createApp(variables: Types.CreateAppMutationVariables, options?: C): Promise<ExecutionResult<Types.CreateAppMutation, E>> {
      return requester<Types.CreateAppMutation, Types.CreateAppMutationVariables>(CreateAppDocument, variables, options) as Promise<ExecutionResult<Types.CreateAppMutation, E>>;
    },
    updateApp(variables: Types.UpdateAppMutationVariables, options?: C): Promise<ExecutionResult<Types.UpdateAppMutation, E>> {
      return requester<Types.UpdateAppMutation, Types.UpdateAppMutationVariables>(UpdateAppDocument, variables, options) as Promise<ExecutionResult<Types.UpdateAppMutation, E>>;
    },
    deleteApp(variables: Types.DeleteAppMutationVariables, options?: C): Promise<ExecutionResult<Types.DeleteAppMutation, E>> {
      return requester<Types.DeleteAppMutation, Types.DeleteAppMutationVariables>(DeleteAppDocument, variables, options) as Promise<ExecutionResult<Types.DeleteAppMutation, E>>;
    },
    regenerateApiKey(variables: Types.RegenerateApiKeyMutationVariables, options?: C): Promise<ExecutionResult<Types.RegenerateApiKeyMutation, E>> {
      return requester<Types.RegenerateApiKeyMutation, Types.RegenerateApiKeyMutationVariables>(RegenerateApiKeyDocument, variables, options) as Promise<ExecutionResult<Types.RegenerateApiKeyMutation, E>>;
    },
    configureAPNs(variables: Types.ConfigureApNsMutationVariables, options?: C): Promise<ExecutionResult<Types.ConfigureApNsMutation, E>> {
      return requester<Types.ConfigureApNsMutation, Types.ConfigureApNsMutationVariables>(ConfigureApNsDocument, variables, options) as Promise<ExecutionResult<Types.ConfigureApNsMutation, E>>;
    },
    configureFCM(variables: Types.ConfigureFcmMutationVariables, options?: C): Promise<ExecutionResult<Types.ConfigureFcmMutation, E>> {
      return requester<Types.ConfigureFcmMutation, Types.ConfigureFcmMutationVariables>(ConfigureFcmDocument, variables, options) as Promise<ExecutionResult<Types.ConfigureFcmMutation, E>>;
    },
    configureWebPush(variables: Types.ConfigureWebPushMutationVariables, options?: C): Promise<ExecutionResult<Types.ConfigureWebPushMutation, E>> {
      return requester<Types.ConfigureWebPushMutation, Types.ConfigureWebPushMutationVariables>(ConfigureWebPushDocument, variables, options) as Promise<ExecutionResult<Types.ConfigureWebPushMutation, E>>;
    },
    apps(variables?: Types.AppsQueryVariables, options?: C): Promise<ExecutionResult<Types.AppsQuery, E>> {
      return requester<Types.AppsQuery, Types.AppsQueryVariables>(AppsDocument, variables, options) as Promise<ExecutionResult<Types.AppsQuery, E>>;
    },
    app(variables: Types.AppQueryVariables, options?: C): Promise<ExecutionResult<Types.AppQuery, E>> {
      return requester<Types.AppQuery, Types.AppQueryVariables>(AppDocument, variables, options) as Promise<ExecutionResult<Types.AppQuery, E>>;
    },
    appBySlug(variables: Types.AppBySlugQueryVariables, options?: C): Promise<ExecutionResult<Types.AppBySlugQuery, E>> {
      return requester<Types.AppBySlugQuery, Types.AppBySlugQueryVariables>(AppBySlugDocument, variables, options) as Promise<ExecutionResult<Types.AppBySlugQuery, E>>;
    },
    appExists(variables: Types.AppExistsQueryVariables, options?: C): Promise<ExecutionResult<Types.AppExistsQuery, E>> {
      return requester<Types.AppExistsQuery, Types.AppExistsQueryVariables>(AppExistsDocument, variables, options) as Promise<ExecutionResult<Types.AppExistsQuery, E>>;
    },
    generateVapidKeys(variables?: Types.GenerateVapidKeysQueryVariables, options?: C): Promise<ExecutionResult<Types.GenerateVapidKeysQuery, E>> {
      return requester<Types.GenerateVapidKeysQuery, Types.GenerateVapidKeysQueryVariables>(GenerateVapidKeysDocument, variables, options) as Promise<ExecutionResult<Types.GenerateVapidKeysQuery, E>>;
    },
    createAutomation(variables: Types.CreateAutomationMutationVariables, options?: C): Promise<ExecutionResult<Types.CreateAutomationMutation, E>> {
      return requester<Types.CreateAutomationMutation, Types.CreateAutomationMutationVariables>(CreateAutomationDocument, variables, options) as Promise<ExecutionResult<Types.CreateAutomationMutation, E>>;
    },
    updateAutomation(variables: Types.UpdateAutomationMutationVariables, options?: C): Promise<ExecutionResult<Types.UpdateAutomationMutation, E>> {
      return requester<Types.UpdateAutomationMutation, Types.UpdateAutomationMutationVariables>(UpdateAutomationDocument, variables, options) as Promise<ExecutionResult<Types.UpdateAutomationMutation, E>>;
    },
    deleteAutomation(variables: Types.DeleteAutomationMutationVariables, options?: C): Promise<ExecutionResult<Types.DeleteAutomationMutation, E>> {
      return requester<Types.DeleteAutomationMutation, Types.DeleteAutomationMutationVariables>(DeleteAutomationDocument, variables, options) as Promise<ExecutionResult<Types.DeleteAutomationMutation, E>>;
    },
    toggleAutomation(variables: Types.ToggleAutomationMutationVariables, options?: C): Promise<ExecutionResult<Types.ToggleAutomationMutation, E>> {
      return requester<Types.ToggleAutomationMutation, Types.ToggleAutomationMutationVariables>(ToggleAutomationDocument, variables, options) as Promise<ExecutionResult<Types.ToggleAutomationMutation, E>>;
    },
    automations(variables?: Types.AutomationsQueryVariables, options?: C): Promise<ExecutionResult<Types.AutomationsQuery, E>> {
      return requester<Types.AutomationsQuery, Types.AutomationsQueryVariables>(AutomationsDocument, variables, options) as Promise<ExecutionResult<Types.AutomationsQuery, E>>;
    },
    automation(variables: Types.AutomationQueryVariables, options?: C): Promise<ExecutionResult<Types.AutomationQuery, E>> {
      return requester<Types.AutomationQuery, Types.AutomationQueryVariables>(AutomationDocument, variables, options) as Promise<ExecutionResult<Types.AutomationQuery, E>>;
    },
    registerDevice(variables: Types.RegisterDeviceMutationVariables, options?: C): Promise<ExecutionResult<Types.RegisterDeviceMutation, E>> {
      return requester<Types.RegisterDeviceMutation, Types.RegisterDeviceMutationVariables>(RegisterDeviceDocument, variables, options) as Promise<ExecutionResult<Types.RegisterDeviceMutation, E>>;
    },
    updateDevice(variables: Types.UpdateDeviceMutationVariables, options?: C): Promise<ExecutionResult<Types.UpdateDeviceMutation, E>> {
      return requester<Types.UpdateDeviceMutation, Types.UpdateDeviceMutationVariables>(UpdateDeviceDocument, variables, options) as Promise<ExecutionResult<Types.UpdateDeviceMutation, E>>;
    },
    deleteDevice(variables: Types.DeleteDeviceMutationVariables, options?: C): Promise<ExecutionResult<Types.DeleteDeviceMutation, E>> {
      return requester<Types.DeleteDeviceMutation, Types.DeleteDeviceMutationVariables>(DeleteDeviceDocument, variables, options) as Promise<ExecutionResult<Types.DeleteDeviceMutation, E>>;
    },
    devices(variables?: Types.DevicesQueryVariables, options?: C): Promise<ExecutionResult<Types.DevicesQuery, E>> {
      return requester<Types.DevicesQuery, Types.DevicesQueryVariables>(DevicesDocument, variables, options) as Promise<ExecutionResult<Types.DevicesQuery, E>>;
    },
    device(variables: Types.DeviceQueryVariables, options?: C): Promise<ExecutionResult<Types.DeviceQuery, E>> {
      return requester<Types.DeviceQuery, Types.DeviceQueryVariables>(DeviceDocument, variables, options) as Promise<ExecutionResult<Types.DeviceQuery, E>>;
    },
    deviceByToken(variables: Types.DeviceByTokenQueryVariables, options?: C): Promise<ExecutionResult<Types.DeviceByTokenQuery, E>> {
      return requester<Types.DeviceByTokenQuery, Types.DeviceByTokenQueryVariables>(DeviceByTokenDocument, variables, options) as Promise<ExecutionResult<Types.DeviceByTokenQuery, E>>;
    },
    sendNotification(variables: Types.SendNotificationMutationVariables, options?: C): Promise<ExecutionResult<Types.SendNotificationMutation, E>> {
      return requester<Types.SendNotificationMutation, Types.SendNotificationMutationVariables>(SendNotificationDocument, variables, options) as Promise<ExecutionResult<Types.SendNotificationMutation, E>>;
    },
    scheduleNotification(variables: Types.ScheduleNotificationMutationVariables, options?: C): Promise<ExecutionResult<Types.ScheduleNotificationMutation, E>> {
      return requester<Types.ScheduleNotificationMutation, Types.ScheduleNotificationMutationVariables>(ScheduleNotificationDocument, variables, options) as Promise<ExecutionResult<Types.ScheduleNotificationMutation, E>>;
    },
    notifications(variables?: Types.NotificationsQueryVariables, options?: C): Promise<ExecutionResult<Types.NotificationsQuery, E>> {
      return requester<Types.NotificationsQuery, Types.NotificationsQueryVariables>(NotificationsDocument, variables, options) as Promise<ExecutionResult<Types.NotificationsQuery, E>>;
    },
    notification(variables: Types.NotificationQueryVariables, options?: C): Promise<ExecutionResult<Types.NotificationQuery, E>> {
      return requester<Types.NotificationQuery, Types.NotificationQueryVariables>(NotificationDocument, variables, options) as Promise<ExecutionResult<Types.NotificationQuery, E>>;
    },
    deliveryLogs(variables?: Types.DeliveryLogsQueryVariables, options?: C): Promise<ExecutionResult<Types.DeliveryLogsQuery, E>> {
      return requester<Types.DeliveryLogsQuery, Types.DeliveryLogsQueryVariables>(DeliveryLogsDocument, variables, options) as Promise<ExecutionResult<Types.DeliveryLogsQuery, E>>;
    },
    dashboardStats(variables?: Types.DashboardStatsQueryVariables, options?: C): Promise<ExecutionResult<Types.DashboardStatsQuery, E>> {
      return requester<Types.DashboardStatsQuery, Types.DashboardStatsQueryVariables>(DashboardStatsDocument, variables, options) as Promise<ExecutionResult<Types.DashboardStatsQuery, E>>;
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;