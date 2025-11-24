# @robojs/roadmap

## Description

Public entry point for the Robo.js roadmap plugin. The module exposes the provider contract and
foundational types required to implement roadmap data sources such as Jira, GitHub Projects, or
Linear. Providers feed cards and column metadata into the sync engine which transforms project
updates into Discord friendly content. The plugin includes automatic initialization, command
interface for setup and sync operations, and imperative APIs for advanced customization.

## Example

```ts
import { RoadmapProvider, type RoadmapCard, type SyncResult } from '@robojs/roadmap';

class LinearProvider extends RoadmapProvider {
  async fetchCards(): Promise<RoadmapCard[]> {
    return [];
  }

  async getColumns() {
    return [];
  }

  async getProviderInfo() {
    return { name: 'Linear', version: '1.0.0', capabilities: [] };
  }
}

const result: SyncResult = {
  cards: [],
  columns: [],
  syncedAt: new Date(),
  stats: { total: 0, created: 0, updated: 0, archived: 0, errors: 0 },
};
```

## Classes

- [JiraProvider](Class.JiraProvider.md)
- [RoadmapProvider](Class.RoadmapProvider.md)
- [SyncCanceledError](Class.SyncCanceledError.md)

## Interfaces

- [CreateRoadmapForumsOptions](Interface.CreateRoadmapForumsOptions.md)
- [JiraProviderConfig](Interface.JiraProviderConfig.md)
- [RoadmapPluginOptions](Interface.RoadmapPluginOptions.md)
- [RoadmapSettings](Interface.RoadmapSettings.md)
- [SyncOptions](Interface.SyncOptions.md)
- [SyncProgressUpdate](Interface.SyncProgressUpdate.md)

## Type Aliases

- [CreateCardInput](TypeAlias.CreateCardInput.md)
- [CreateCardResult](TypeAlias.CreateCardResult.md)
- [DateRangeFilter](TypeAlias.DateRangeFilter.md)
- [ForumPermissionMode](TypeAlias.ForumPermissionMode.md)
- [ProviderConfig](TypeAlias.ProviderConfig.md)
- [ProviderInfo](TypeAlias.ProviderInfo.md)
- [RoadmapCard](TypeAlias.RoadmapCard.md)
- [RoadmapColumn](TypeAlias.RoadmapColumn.md)
- [SyncResult](TypeAlias.SyncResult.md)
- [ThreadOperation](TypeAlias.ThreadOperation.md)
- [UpdateCardInput](TypeAlias.UpdateCardInput.md)
- [UpdateCardResult](TypeAlias.UpdateCardResult.md)

## Variables

- [Buttons](Variable.Buttons.md)
- [ID\_NAMESPACE](Variable.ID_NAMESPACE.md)
- [options](Variable.options.md)
- [Selects](Variable.Selects.md)

## Functions

- [addThreadToHistory](Function.addThreadToHistory.md)
- [canUserCreateCards](Function.canUserCreateCards.md)
- [createOrGetRoadmapCategory](Function.createOrGetRoadmapCategory.md)
- [formatCardContent](Function.formatCardContent.md)
- [getAllForumChannels](Function.getAllForumChannels.md)
- [getAuthorizedCreatorRoles](Function.getAuthorizedCreatorRoles.md)
- [getCardsFromDateRange](Function.getCardsFromDateRange.md)
- [getCardsFromLastDays](Function.getCardsFromLastDays.md)
- [getCardsFromLastMonth](Function.getCardsFromLastMonth.md)
- [getCardsFromLastWeek](Function.getCardsFromLastWeek.md)
- [getCategoryId](Function.getCategoryId.md)
- [getCurrentThreadInfo](Function.getCurrentThreadInfo.md)
- [getForumChannelForColumn](Function.getForumChannelForColumn.md)
- [getForumChannelIdForColumn](Function.getForumChannelIdForColumn.md)
- [getProvider](Function.getProvider.md)
- [getRoadmapCategory](Function.getRoadmapCategory.md)
- [getSettings](Function.getSettings.md)
- [getSyncedPostId](Function.getSyncedPostId.md)
- [getThreadForColumn](Function.getThreadForColumn.md)
- [getThreadHistory](Function.getThreadHistory.md)
- [isForumPublic](Function.isForumPublic.md)
- [isProviderReady](Function.isProviderReady.md)
- [moveThreadToNewForum](Function.moveThreadToNewForum.md)
- [setAuthorizedCreatorRoles](Function.setAuthorizedCreatorRoles.md)
- [setSyncedPost](Function.setSyncedPost.md)
- [syncRoadmap](Function.syncRoadmap.md)
- [syncSingleCard](Function.syncSingleCard.md)
- [toggleForumAccess](Function.toggleForumAccess.md)
- [updateForumTagsForColumn](Function.updateForumTagsForColumn.md)
- [updateSettings](Function.updateSettings.md)
