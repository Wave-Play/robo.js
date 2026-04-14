---
'@robojs/discordjs': minor
---

feat: bubble subcommand metadata to synthesized root commands

When subcommands exist without an explicit root command file, metadata such as integrationTypes, contexts, defaultMemberPermissions, and dmPermission is now merged from leaf subcommands to the synthesized root command. Permissions are applied regardless of subcommand presence.
