---
id: "0116"
kind: "change"
title: "Claude Code session 2026-09-16"
date: "2026-09-16"
updated: "2026-09-16"
status: "draft"
areas:
  - "operations"
  - "symbols"
  - "tests"
  - "verify"
files:
  - ".ledger/config.yaml"
  - ".ledger/entries/0115-run-verification-commands-and-record-evidence.md"
  - ".ledger/sessions/S0002-claude-code-session-2026-09-16.md"
  - ".ledger/sessions/S0003-claude-code-session-2026-09-16.md"
  - "README.md"
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
  - "src/commands/packet.ts"
  - "src/config.ts"
  - "src/doctor.ts"
  - "src/engine.ts"
  - "src/git.ts"
  - "src/index.ts"
  - "src/operations/definitions/records.ts"
  - "src/operations/definitions/retrieval.ts"
  - "src/operations/definitions/server.ts"
  - "src/operations/definitions/verify.ts"
  - "src/operations/registry.ts"
  - "src/packet.ts"
  - "src/render.ts"
  - "src/renderHtml.ts"
  - "src/retrieval.ts"
  - "src/stale.ts"
  - "src/symbols.ts"
  - "src/types.ts"
  - "src/verify.ts"
  - "src/workspace.ts"
  - "test/doctor.test.ts"
  - "test/fixtures/operations-contract.json"
  - "test/verify.test.ts"
symbols:
  - "0001: Bootstrap Ledger"
  - "0020: Overhaul README And Prepare Patch Release"
  - "0021: Improve Changelog Migration Receipt"
  - "0115: Run Verification Commands And Record Evidence"
  - "Acceptance Checks"
  - "Adoption And Migration"
  - "Agent Digest"
  - "Agent Workflow"
  - "At A Glance"
  - "B001: Git-Aware Entry Drafting"
  - "Backlog Item"
  - "Behavior And UX Impact"
  - "Build The Local Reader"
  - "CI Summary"
  - "Capture Hooks"
  - "Catalog Cache"
  - "Change Entry"
  - "Changed Files"
  - "Changed Files Section"
  - "ChangedFileBlock"
  - "Changes"
  - "Command Map"
  - "Command Model"
  - "Compatibility Promise"
  - "Config"
  - "Config Validation"
  - "Config Versioning"
  - "Conflict Rules"
  - "ConflictInput"
  - "ConflictOutput"
  - "Consequences"
  - "Context"
  - "Core Modules"
  - "Coverage Config"
  - "D001: Markdown Is The Source Of Truth"
  - "Data Flow"
  - "Decision"
  - "Desired Outcome"
  - "Development"
  - "Docs Bridge"
  - "Docs Impact Declaration"
  - "Docs Relationship"
  - "Engine Server"
  - "EngineState"
  - "Error Philosophy"
  - "Example Change Entry"
  - "ExplainInput"
  - "ExplainOutput"
  - "Extension Points"
  - "File Transactions"
  - "Finding"
  - "Five Minute Start"
  - "Follow-ups"
  - "Generated Files"
  - "GetChangedFilesOptions"
  - "Git Inspector"
  - "GitChangeStatus"
  - "GitChangedFile"
  - "GitInspection"
  - "Host Hooks"
  - "Impact"
  - "Independence From Dossier"
  - "Index Builder"
  - "IndexOutput"
  - "InitInput"
  - "InitOutput"
  - "InitWorkspaceOptions"
  - "Initialize Ledger In A Project"
  - "Integrity"
  - "IntegrityInput"
  - "IntegrityOutput"
  - "Invariants"
  - "Invariants Section"
  - "Known Issues"
  - "Layers"
  - "Learned"
  - "Ledger 0.1.0"
  - "Ledger Architecture"
  - "Ledger Schema"
  - "LedgerAgentPacket"
  - "LedgerAgentPacketOptions"
  - "LedgerConfig"
  - "LedgerConfigMigration"
  - "LedgerConfigMigrationResult"
  - "LedgerCoverageFile"
  - "LedgerCoverageMode"
  - "LedgerCoverageResult"
  - "LedgerDocsAdoption"
  - "LedgerDocsAudit"
  - "LedgerDocsClassification"
  - "LedgerDocsFile"
  - "LedgerDocsImpact"
  - "LedgerDocsImpactDeclaration"
  - "LedgerDocsImpactEvidence"
  - "LedgerDocsImpactFile"
  - "LedgerDocsImpactStatus"
  - "LedgerDocsRoute"
  - "LedgerDocsRoutingManifest"
  - "LedgerDoctorCheck"
  - "LedgerDoctorCheckLevel"
  - "LedgerDoctorResult"
  - "LedgerDocumentKind"
  - "LedgerEngineEventName"
  - "LedgerEngineOptions"
  - "LedgerEngineResult"
  - "LedgerEvidenceEntry"
  - "LedgerEvidenceIndex"
  - "LedgerEvidenceResult"
  - "LedgerFacet"
  - "LedgerFileMatchKind"
  - "LedgerFrontmatter"
  - "LedgerGraphEdge"
  - "LedgerGraphNode"
  - "LedgerIndexes"
  - "LedgerIssue"
  - "LedgerIssueCode"
  - "LedgerIssueLevel"
  - "LedgerManifest"
  - "LedgerOperationContract"
  - "LedgerOperationsContract"
  - "LedgerPacketCommandOptions"
  - "LedgerPacketCommandResult"
  - "LedgerPacketEntry"
  - "LedgerPacketRelated"
  - "LedgerRelationshipGraph"
  - "LedgerRelationshipKind"
  - "LedgerRenderArtifact"
  - "LedgerRenderArtifactKind"
  - "LedgerRenderBudgetResult"
  - "LedgerRenderProfile"
  - "LedgerRenderedDocument"
  - "LedgerRetrievalFileMatch"
  - "LedgerRetrievalMissingRecord"
  - "LedgerRetrievalRecord"
  - "LedgerRetrievalRelatedRecord"
  - "LedgerRetrievalResult"
  - "LedgerSchemaFieldType"
  - "LedgerSearchAgentPacketOptions"
  - "LedgerSearchDocument"
  - "LedgerSearchFields"
  - "LedgerSourceManifestEntry"
  - "LedgerSourceManifestState"
  - "LedgerStaleIssue"
  - "LedgerStaleReport"
  - "LedgerStaticReaderModel"
  - "LedgerValidationProfile"
  - "LedgerValidationResult"
  - "LedgerVerificationCommand"
  - "LedgerVerificationFreshness"
  - "LedgerVerifyRecord"
  - "LedgerVerifyReport"
  - "LedgerWorkspace"
  - "Library API"
  - "Library Usage"
  - "License"
  - "MCP Server"
  - "MarkdownSection"
  - "Migration Notes"
  - "Next"
  - "Normalized Manifest Shape"
  - "NormalizedLedgerDocument"
  - "Notes"
  - "PacketInput"
  - "PacketOutput"
  - "ParsedLedgerDocument"
  - "Parser"
  - "PartialLedgerConfig"
  - "Pattern: generated index paths"
  - "Performance Budget Config"
  - "Problem"
  - "Product Boundary"
  - "Product Note Or Feedback"
  - "Project Docs"
  - "Promotion Notes"
  - "Public Notes"
  - "Public Reader Export"
  - "Published Package Shape"
  - "Publishing To npm"
  - "Query Engine"
  - "QueryInput"
  - "QueryOutput"
  - "README.md"
  - "Readiness"
  - "Recommendation"
  - "Record A Change"
  - "Registry, tests, docs, and dogfood"
  - "Release"
  - "Release Workflow"
  - "Render And Export Adapters"
  - "Render Budget Config"
  - "Render Profiles"
  - "RenderStaticReaderHtmlOptions"
  - "RenderStaticReaderResult"
  - "RetrieveOptions"
  - "Revisit Criteria"
  - "Risks"
  - "S0001: Claude Code Session 2026-09-16"
  - "S0002: Claude Code session 2026-09-16"
  - "S0003: Claude Code session 2026-09-16"
  - "Schema Validator"
  - "Scope"
  - "SearchInput"
  - "SearchOutput"
  - "SearchPacketInput"
  - "ServeInput"
  - "ServeOutput"
  - "Session"
  - "Shared Frontmatter"
  - "Skill And Instructions"
  - "Source Resource Limits"
  - "Status Vocabulary"
  - "Summary"
  - "Surfacing"
  - "ValidateInput"
  - "ValidateOutput"
  - "Validation Profiles"
  - "Verification"
  - "Verification Config"
  - "Verification Evidence"
  - "Verification Section"
  - "Verification module and operation"
  - "VerifyInput"
  - "VerifyOptions"
  - "What Ledger Creates"
  - "Why"
  - "Why Ledger Exists"
  - "Work From This Repo Today"
  - "Workspace Discovery"
  - "`ledger ci`"
  - "`ledger conflict <path...>`"
  - "`ledger docs classify`"
  - "`ledger docs impact`"
  - "`ledger doctor`"
  - "`ledger explain <path>`"
  - "`ledger index`"
  - "`ledger init`"
  - "`ledger new`"
  - "`ledger release <version>`"
  - "`ledger render`"
  - "`ledger serve`"
  - "`ledger stale`"
  - "`ledger validate`"
  - "activeSourceExpectedHash"
  - "adoptOperation"
  - "adoptionFromManaged"
  - "agentPacketDigest"
  - "allow"
  - "allowMethods"
  - "apiDescription"
  - "apiOperations"
  - "backlogTemplate"
  - "blockTitleMatchesPath"
  - "broadcast"
  - "buildAgentPacket"
  - "buildOperationsContract"
  - "buildRelationshipGraph"
  - "buildSearchAgentPacket"
  - "buildSearchIndex"
  - "buildStaticReaderModel"
  - "cacheCheck"
  - "captureRun"
  - "changeTemplate"
  - "changedFilesError"
  - "checkRenderBudgets"
  - "compactPacketEntry"
  - "compactSection"
  - "compareChangedFiles"
  - "configRelativePath"
  - "conflictOperation"
  - "contextBlock"
  - "contextGrid"
  - "countFacet"
  - "countTypes"
  - "coveragePolicy"
  - "coverageStatus"
  - "currentConfigVersion"
  - "decisionTemplate"
  - "defaultConfig"
  - "densityToggle"
  - "detailList"
  - "detectStaleKnowledge"
  - "docsReadme"
  - "docsStartHere"
  - "documentKinds"
  - "domId"
  - "emptyEvidenceIndex"
  - "engineCheck"
  - "engineCloseGraceMs"
  - "entry"
  - "escapeHtml"
  - "estimatePacketTokens"
  - "estimateTokens"
  - "evidenceFields"
  - "evidenceFreshness"
  - "evidencePathFor"
  - "execFileAsync"
  - "executeCommand"
  - "explainOperation"
  - "extractChangedFileBlocks"
  - "extractConflictRules"
  - "extractConflictRulesForFiles"
  - "facetButtons"
  - "fail"
  - "fieldPath"
  - "filterBar"
  - "findOperation"
  - "findOperationByTool"
  - "findProjectRoot"
  - "findWorkspace"
  - "fixtureRepo"
  - "formatAgentPacket"
  - "formatDate"
  - "formatDoctorResult"
  - "formatGeneratedAt"
  - "formatLedgerPacketResult"
  - "formatStaleReport"
  - "formatVerifyReport"
  - "generatedSourceHrefPattern"
  - "getChangedFileDetails"
  - "getChangedFiles"
  - "getHeadCommit"
  - "gitCheck"
  - "graphSummary"
  - "groupIssuesByPath"
  - "handleEngineRequest"
  - "handleMcp"
  - "health"
  - "heartbeatMs"
  - "icon"
  - "iconPaths"
  - "iconSprite"
  - "indexFreshnessCheck"
  - "indexOperation"
  - "initOperation"
  - "initOutput"
  - "initWorkspace"
  - "initialLedgerReadme"
  - "inspectGit"
  - "internalRail"
  - "invalidSourceManifest"
  - "isAllowedCommand"
  - "isBoundedText"
  - "isCheckableSymbol"
  - "isCode"
  - "isEvidenceIndex"
  - "isExpiredSession"
  - "isRecord"
  - "isSchemaFieldType"
  - "issueList"
  - "jsonType"
  - "kindIcon"
  - "labelForKind"
  - "ledgerOperations"
  - "ledgerOperationsContractVersion"
  - "mapStringValues"
  - "matchFilePath"
  - "matchesSimpleGlob"
  - "maxBodyBytes"
  - "maxCommandOutputBytes"
  - "maxConfigBytes"
  - "maxRelatedUnderBudget"
  - "maxYamlAliases"
  - "mcpInputSchema"
  - "mcpOperation"
  - "mcpProjectRootShape"
  - "mergeConfig"
  - "metric"
  - "metricButton"
  - "migrateConfigV0ToV1"
  - "migrateLedgerConfigObject"
  - "miniMetric"
  - "modifiedAt"
  - "nestedVerifyEnvironmentVariable"
  - "normalizeConfigPath"
  - "normalizeConfigPaths"
  - "normalizeOutputPath"
  - "openEventStream"
  - "option"
  - "optionalBoolean"
  - "optionalCacheBackend"
  - "optionalDocsAdoption"
  - "optionalNumber"
  - "optionalObject"
  - "optionalString"
  - "optionalStringArray"
  - "optionalValidationProfile"
  - "packetOperation"
  - "packetOutput"
  - "packetSummary"
  - "parseLedgerConfig"
  - "parseNameStatusLine"
  - "parseNullDelimitedNameStatus"
  - "parseNullDelimitedShortStatus"
  - "parseStatusLine"
  - "parseVerificationBullet"
  - "pathExists"
  - "perPageControl"
  - "performanceCheck"
  - "positiveInteger"
  - "productNoteTemplate"
  - "publicDocument"
  - "publicNotesList"
  - "pushIndentedList"
  - "pushInlineList"
  - "pushSection"
  - "queryOperation"
  - "rawConfigVersion"
  - "readEvidence"
  - "readIconSvg"
  - "readJsonBody"
  - "readLedgerConfig"
  - "readSourceManifest"
  - "recordDetail"
  - "recordPanel"
  - "relatedRecordSchema"
  - "relatedRecords"
  - "relationshipFields"
  - "relationships"
  - "releaseTemplate"
  - "renderArtifact"
  - "renderBudgetCheck"
  - "renderEntry"
  - "renderOperation"
  - "renderOutputCheck"
  - "renderOutputDirectory"
  - "renderProfileSchema"
  - "renderPublicEntry"
  - "renderReader"
  - "renderSourcesArtifact"
  - "renderStaticReaderHtml"
  - "requiredSections"
  - "retrievalRecordSchema"
  - "retrieveByPath"
  - "runApiOperation"
  - "runDoctor"
  - "runLedgerPacketCommand"
  - "runVerification"
  - "searchDialog"
  - "searchFields"
  - "searchOperation"
  - "searchPacketOperation"
  - "searchTerms"
  - "selectControl"
  - "selectEntries"
  - "selectPacketEntries"
  - "sendJson"
  - "serializeDefaultConfig"
  - "serializedSearchIndex"
  - "serveOperation"
  - "serverCard"
  - "sessionTemplate"
  - "sessionTemplatePlaceholders"
  - "shellOperatorPattern"
  - "sourceDownloadName"
  - "sourceHashPattern"
  - "sourceHref"
  - "sourceManifestHref"
  - "sourceSidecars"
  - "splitShellWords"
  - "src/cli.ts"
  - "startLedgerEngine"
  - "staticRootFor"
  - "statusFromCode"
  - "statusFromShortCode"
  - "supersededByIndex"
  - "symbolsCheck"
  - "symbolsMissingFromFiles"
  - "tag"
  - "tempDir"
  - "titleCandidates"
  - "validateChangedFilesOptions"
  - "validateGitRevision"
  - "validateLedgerConfig"
  - "validateOperation"
  - "validatePartialConfig"
  - "validateWorkspacePaths"
  - "verificationCheck"
  - "verificationDescription"
  - "verificationFields"
  - "verifyIntegrityOperation"
  - "verifyOperation"
  - "waitForSignal"
  - "workingTreeDirty"
  - "writeAgentPacketReport"
  - "writeEvent"
  - "writeEvidence"
  - "writeFileIfMissing"
  - "writeStaleReport"
  - "writeStateCheck"
  - "writeStaticReader"
docs:
  - "docs/ARCHITECTURE.md"
  - "docs/SCHEMA.md"
docsImpact:
  status: "none"
  reason: "TODO: explain why durable docs were updated or not needed."
commits: []
related:
  - "S0003"
---

# 0116: Claude Code session 2026-09-16

## Summary

Describe what changed in two to five sentences.

## Why

Explain the motivation, context, and rejected alternatives that future agents
should not accidentally undo.

## Changed Files

### .ledger/config.yaml

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: TODO: name the important symbol, route, command, or section.
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### .ledger/entries/0115-run-verification-commands-and-record-evidence.md

- Status: untracked
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: 0115: Run Verification Commands And Record Evidence, Behavior And UX Impact, Changed Files, Config, Invariants, Notes, Registry, tests, docs, and dogfood, Summary, Surfacing, Verification, Verification module and operation, Why
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### .ledger/sessions/S0002-claude-code-session-2026-09-16.md

- Status: untracked
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: Learned, Next, S0002: Claude Code session 2026-09-16, Summary
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### .ledger/sessions/S0003-claude-code-session-2026-09-16.md

- Status: untracked
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: Learned, Next, S0003: Claude Code session 2026-09-16, Summary
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### docs/ARCHITECTURE.md

- Status: modified
- What changed: TODO: summarize the documentation update and the source behavior it explains.
- Anchor: CI Summary, Capture Hooks, Catalog Cache, Command Model, Config, Core Modules, Data Flow, Docs Bridge, Engine Server, Error Philosophy, Extension Points, File Transactions, Generated Files, Git Inspector, Independence From Dossier, Index Builder, Integrity, Layers, Ledger Architecture, MCP Server, Parser, Query Engine, Release Workflow, Render And Export Adapters, Render Profiles, Schema Validator, Verification Evidence, Workspace Discovery, `ledger ci`, `ledger conflict <path...>`, `ledger docs classify`, `ledger docs impact`, `ledger doctor`, `ledger explain <path>`, `ledger index`, `ledger init`, `ledger new`, `ledger release <version>`, `ledger render`, `ledger serve`, `ledger stale`, `ledger validate`
- On conflict: TODO: describe what must be preserved.
- Docs impact: This file is direct docs impact.

### docs/SCHEMA.md

- Status: modified
- What changed: TODO: summarize the documentation update and the source behavior it explains.
- Anchor: 0001: Bootstrap Ledger, 0021: Improve Changelog Migration Receipt, Acceptance Checks, Agent Digest, B001: Git-Aware Entry Drafting, Backlog Item, Behavior And UX Impact, Change Entry, Changed Files, Changed Files Section, Changes, Compatibility Promise, Config Validation, Config Versioning, Conflict Rules, Consequences, Context, Coverage Config, D001: Markdown Is The Source Of Truth, Decision, Desired Outcome, Docs Impact Declaration, Finding, Follow-ups, Impact, Invariants, Invariants Section, Known Issues, Learned, Ledger 0.1.0, Ledger Schema, Migration Notes, Next, Normalized Manifest Shape, Notes, Pattern: generated index paths, Performance Budget Config, Problem, Product Note Or Feedback, Promotion Notes, Public Notes, Readiness, Recommendation, Release, Render Budget Config, Revisit Criteria, Risks, S0001: Claude Code Session 2026-09-16, Scope, Session, Shared Frontmatter, Source Resource Limits, Status Vocabulary, Summary, Validation Profiles, Verification, Verification Config, Verification Section, Why, src/cli.ts
- On conflict: TODO: describe what must be preserved.
- Docs impact: This file is direct docs impact.

### README.md

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: 0020: Overhaul README And Prepare Patch Release, Adoption And Migration, Agent Workflow, At A Glance, Behavior And UX Impact, Build The Local Reader, Changed Files, Command Map, Development, Docs Relationship, Example Change Entry, Five Minute Start, Host Hooks, Initialize Ledger In A Project, Integrity, Invariants, Library API, Library Usage, License, Product Boundary, Project Docs, Public Reader Export, Published Package Shape, Publishing To npm, README.md, Record A Change, Release Workflow, Skill And Instructions, Summary, Verification, What Ledger Creates, Why, Why Ledger Exists, Work From This Repo Today
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/commands/packet.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: LedgerPacketCommandOptions, LedgerPacketCommandResult, formatLedgerPacketResult, runLedgerPacketCommand
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/config.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: LedgerConfigMigration, LedgerConfigMigrationResult, PartialLedgerConfig, adoptionFromManaged, currentConfigVersion, defaultConfig, documentKinds, fail, fieldPath, isRecord, isSchemaFieldType, mapStringValues, maxConfigBytes, maxYamlAliases, mergeConfig, migrateConfigV0ToV1, migrateLedgerConfigObject, normalizeConfigPath, normalizeConfigPaths, optionalBoolean, optionalCacheBackend, optionalDocsAdoption, optionalNumber, optionalObject, optionalString, optionalStringArray, optionalValidationProfile, parseLedgerConfig, rawConfigVersion, readLedgerConfig, requiredSections, validateLedgerConfig, validatePartialConfig
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/doctor.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: LedgerDoctorCheck, LedgerDoctorCheckLevel, LedgerDoctorResult, cacheCheck, engineCheck, formatDoctorResult, gitCheck, indexFreshnessCheck, isCode, modifiedAt, performanceCheck, renderBudgetCheck, renderOutputCheck, runDoctor, symbolsCheck, verificationCheck, writeStateCheck
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/engine.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: EngineState, LedgerEngineEventName, LedgerEngineOptions, LedgerEngineResult, allowMethods, apiDescription, apiOperations, broadcast, engineCloseGraceMs, handleEngineRequest, handleMcp, health, heartbeatMs, jsonType, maxBodyBytes, openEventStream, readJsonBody, renderReader, runApiOperation, sendJson, serverCard, startLedgerEngine, staticRootFor, writeEvent
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/git.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: GetChangedFilesOptions, GitChangeStatus, GitChangedFile, GitInspection, changedFilesError, compareChangedFiles, execFileAsync, getChangedFileDetails, getChangedFiles, getHeadCommit, inspectGit, parseNameStatusLine, parseNullDelimitedNameStatus, parseNullDelimitedShortStatus, parseStatusLine, statusFromCode, statusFromShortCode, validateChangedFilesOptions, validateGitRevision
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/index.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: TODO: name the important symbol, route, command, or section.
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/operations/definitions/records.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: IndexOutput, InitInput, InitOutput, IntegrityInput, IntegrityOutput, ValidateInput, ValidateOutput, adoptOperation, indexOperation, initOperation, initOutput, renderOperation, renderProfileSchema, validateOperation, verifyIntegrityOperation
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/operations/definitions/retrieval.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: ConflictInput, ConflictOutput, ExplainInput, ExplainOutput, PacketInput, PacketOutput, QueryInput, QueryOutput, SearchInput, SearchOutput, SearchPacketInput, conflictOperation, documentKinds, explainOperation, packetOperation, packetOutput, packetSummary, pushIndentedList, queryOperation, relatedRecordSchema, retrievalRecordSchema, searchOperation, searchPacketOperation
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/operations/definitions/server.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: ServeInput, ServeOutput, mcpOperation, serveOperation, waitForSignal
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/operations/definitions/verify.ts

- Status: untracked
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: VerifyInput, verifyOperation
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/operations/registry.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: LedgerOperationContract, LedgerOperationsContract, buildOperationsContract, findOperation, findOperationByTool, ledgerOperations, ledgerOperationsContractVersion, mcpInputSchema, mcpProjectRootShape
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/packet.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: LedgerAgentPacket, LedgerAgentPacketOptions, LedgerPacketEntry, LedgerPacketRelated, LedgerSearchAgentPacketOptions, buildAgentPacket, buildSearchAgentPacket, compactPacketEntry, estimatePacketTokens, estimateTokens, formatAgentPacket, maxRelatedUnderBudget, positiveInteger, pushInlineList, pushSection, selectPacketEntries, writeAgentPacketReport
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/render.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: LedgerFacet, LedgerGraphEdge, LedgerGraphNode, LedgerRelationshipGraph, LedgerRenderArtifact, LedgerRenderArtifactKind, LedgerRenderBudgetResult, LedgerRenderProfile, LedgerRenderedDocument, LedgerSearchDocument, LedgerSearchFields, LedgerSourceManifestEntry, LedgerSourceManifestState, LedgerStaticReaderModel, RenderStaticReaderResult, activeSourceExpectedHash, buildRelationshipGraph, buildSearchIndex, buildStaticReaderModel, checkRenderBudgets, compactSection, countFacet, coverageStatus, generatedSourceHrefPattern, groupIssuesByPath, invalidSourceManifest, isCode, normalizeOutputPath, publicDocument, readIconSvg, readSourceManifest, renderArtifact, renderOutputDirectory, renderSourcesArtifact, searchFields, searchTerms, serializedSearchIndex, sourceHashPattern, sourceHref, sourceManifestHref, sourceSidecars, verificationFields, writeStaticReader
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/renderHtml.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: RenderStaticReaderHtmlOptions, agentPacketDigest, contextBlock, contextGrid, countTypes, densityToggle, detailList, domId, escapeHtml, facetButtons, filterBar, formatDate, formatGeneratedAt, graphSummary, icon, iconPaths, iconSprite, internalRail, issueList, kindIcon, labelForKind, metric, metricButton, miniMetric, option, perPageControl, publicNotesList, recordDetail, recordPanel, relationships, renderEntry, renderPublicEntry, renderStaticReaderHtml, searchDialog, searchTerms, selectControl, sourceDownloadName, tag, verificationDescription
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/retrieval.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: ChangedFileBlock, LedgerFileMatchKind, LedgerRelationshipKind, LedgerRetrievalFileMatch, LedgerRetrievalMissingRecord, LedgerRetrievalRecord, LedgerRetrievalRelatedRecord, LedgerRetrievalResult, RetrieveOptions, blockTitleMatchesPath, evidenceFields, extractChangedFileBlocks, extractConflictRules, extractConflictRulesForFiles, matchFilePath, matchesSimpleGlob, relatedRecords, retrieveByPath, supersededByIndex, titleCandidates
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/stale.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: LedgerStaleIssue, LedgerStaleReport, detectStaleKnowledge, formatStaleReport, isCheckableSymbol, isCode, isExpiredSession, relationshipFields, symbolsMissingFromFiles, writeStaleReport
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/types.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: LedgerConfig, LedgerCoverageFile, LedgerCoverageMode, LedgerCoverageResult, LedgerDocsAdoption, LedgerDocsAudit, LedgerDocsClassification, LedgerDocsFile, LedgerDocsImpact, LedgerDocsImpactDeclaration, LedgerDocsImpactEvidence, LedgerDocsImpactFile, LedgerDocsImpactStatus, LedgerDocsRoute, LedgerDocsRoutingManifest, LedgerDocumentKind, LedgerFrontmatter, LedgerIndexes, LedgerIssue, LedgerIssueCode, LedgerIssueLevel, LedgerManifest, LedgerSchemaFieldType, LedgerValidationProfile, LedgerValidationResult, LedgerWorkspace, MarkdownSection, NormalizedLedgerDocument, ParsedLedgerDocument
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/verify.ts

- Status: untracked
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: LedgerEvidenceEntry, LedgerEvidenceIndex, LedgerEvidenceResult, LedgerVerificationCommand, LedgerVerificationFreshness, LedgerVerifyRecord, LedgerVerifyReport, VerifyOptions, emptyEvidenceIndex, evidenceFreshness, evidencePathFor, executeCommand, formatVerifyReport, isAllowedCommand, isBoundedText, isCode, isEvidenceIndex, isRecord, maxCommandOutputBytes, nestedVerifyEnvironmentVariable, parseVerificationBullet, readEvidence, runVerification, selectEntries, shellOperatorPattern, splitShellWords, workingTreeDirty, writeEvidence
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### src/workspace.ts

- Status: modified
- What changed: TODO: summarize the implementation change and the user, agent, or maintainer impact.
- Anchor: InitWorkspaceOptions, backlogTemplate, changeTemplate, configRelativePath, coveragePolicy, decisionTemplate, docsReadme, docsStartHere, findProjectRoot, findWorkspace, initWorkspace, initialLedgerReadme, isCode, pathExists, productNoteTemplate, releaseTemplate, serializeDefaultConfig, sessionTemplate, sessionTemplatePlaceholders, validateWorkspacePaths, writeFileIfMissing
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### test/doctor.test.ts

- Status: modified
- What changed: TODO: summarize the behavior now covered or protected by this test change.
- Anchor: tempDir
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### test/fixtures/operations-contract.json

- Status: modified
- What changed: TODO: summarize the behavior now covered or protected by this test change.
- Anchor: TODO: name the important symbol, route, command, or section.
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

### test/verify.test.ts

- Status: untracked
- What changed: TODO: summarize the behavior now covered or protected by this test change.
- Anchor: allow, captureRun, entry, execFileAsync, fixtureRepo, tempDir
- On conflict: TODO: describe what must be preserved.
- Docs impact: TODO: name updated docs, explain why docs were not needed, or add a docs file to this entry.

- What changed:
- Anchor:
- On conflict:

## Behavior And UX Impact

Describe what users, maintainers, operators, or agents observe differently.

## Invariants

- Add testable assertions that must remain true.

## Verification

- Add exact commands or checks.

## Notes

Add follow-ups, limitations, or related records.
