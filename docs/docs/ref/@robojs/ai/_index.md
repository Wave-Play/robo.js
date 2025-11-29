# @robojs/ai

## Description

Central entry point for the [Robo.js](https://github.com/robojs/robo.js) AI plugin.
Exposes the primary runtime singleton, token usage ledger, error classes, and engine contracts
required to integrate conversational and generative AI into Robo-powered bots, activities, and
web servers. Import from this module when building custom workflows, extending the AI engine
catalog, or composing plugins that depend on shared AI services.

## Classes

- [BaseEngine](Class.BaseEngine.md)
- [TokenLimitError](Class.TokenLimitError.md)

## Interfaces

- [ChatFunction](Interface.ChatFunction.md)
- [ChatFunctionCall](Interface.ChatFunctionCall.md)
- [ChatFunctionParameters](Interface.ChatFunctionParameters.md)
- [ChatFunctionProperty](Interface.ChatFunctionProperty.md)
- [ChatMessage](Interface.ChatMessage.md)
- [ChatOptions](Interface.ChatOptions.md)
- [ChatResult](Interface.ChatResult.md)
- [ConversationInput](Interface.ConversationInput.md)
- [ConversationState](Interface.ConversationState.md)
- [EngineSupportedFeatures](Interface.EngineSupportedFeatures.md)
- [GenerateImageOptions](Interface.GenerateImageOptions.md)
- [GenerateImageResult](Interface.GenerateImageResult.md)
- [MCPTool](Interface.MCPTool.md)
- [PluginOptions](Interface.PluginOptions.md)
- [PluginUsageOptions](Interface.PluginUsageOptions.md)
- [TokenLedgerConfiguration](Interface.TokenLedgerConfiguration.md)
- [TokenLedgerHooks](Interface.TokenLedgerHooks.md)
- [TokenLimitBreach](Interface.TokenLimitBreach.md)
- [TokenLimitConfig](Interface.TokenLimitConfig.md)
- [TokenLimitErrorContext](Interface.TokenLimitErrorContext.md)
- [TokenLimitRule](Interface.TokenLimitRule.md)
- [TokenLimitState](Interface.TokenLimitState.md)
- [TokenRecordOptions](Interface.TokenRecordOptions.md)
- [TokenRecordResult](Interface.TokenRecordResult.md)
- [TokenSummaryQuery](Interface.TokenSummaryQuery.md)
- [TokenSummaryResult](Interface.TokenSummaryResult.md)
- [TokenUsageEntry](Interface.TokenUsageEntry.md)
- [TokenWindowTotals](Interface.TokenWindowTotals.md)
- [UsageLimitEvent](Interface.UsageLimitEvent.md)
- [UsageRecordedEvent](Interface.UsageRecordedEvent.md)
- [VoiceChatMetadata](Interface.VoiceChatMetadata.md)
- [VoiceChatOptions](Interface.VoiceChatOptions.md)
- [VoiceChatResult](Interface.VoiceChatResult.md)
- [VoiceInputFrame](Interface.VoiceInputFrame.md)
- [VoicePlaybackDelta](Interface.VoicePlaybackDelta.md)
- [VoiceSessionHandle](Interface.VoiceSessionHandle.md)
- [VoiceSessionStartOptions](Interface.VoiceSessionStartOptions.md)
- [VoiceTranscriptSegment](Interface.VoiceTranscriptSegment.md)

## Type Aliases

- [ChatMessageContent](TypeAlias.ChatMessageContent.md)
- [Hook](TypeAlias.Hook.md)
- [TokenLimitMode](TypeAlias.TokenLimitMode.md)
- [TokenSummaryWindow](TypeAlias.TokenSummaryWindow.md)
- [TokenWindow](TypeAlias.TokenWindow.md)
- [UsageEventListener](TypeAlias.UsageEventListener.md)
- [UsageEventName](TypeAlias.UsageEventName.md)
- [VoiceEndpointingStrategy](TypeAlias.VoiceEndpointingStrategy.md)

## Variables

- [AI](Variable.AI.md)
- [tokenLedger](Variable.tokenLedger.md)
