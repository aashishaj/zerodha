# AI Assistant Instructions - README

This directory contains instruction files for AI coding assistants (GitHub Copilot, Claude, Cursor, etc.) to help them understand your coding preferences, project structure, and best practices.

## Files Overview

### 1. `.cursorrules`
**Purpose**: Rules for Cursor AI editor  
**Contains**:
- General coding standards (Python, testing, documentation)
- Project-specific rules (D2k, Dagster, data engineering)
- Version control and dependency management guidelines

**Used by**: Cursor AI editor

### 2. `agent.md`
**Purpose**: Instructions for autonomous AI agents  
**Contains**:
- Core principles (communication, code implementation, file operations)
- Project context (workspace structure, tech stack)
- Specific instructions for different project types
- Problem-solving approach and common patterns

**Used by**: GitHub Copilot Agents, autonomous coding agents

### 3. `claude.md`
**Purpose**: Detailed instructions for Claude AI  
**Contains**:
- General guidelines and approach
- Workspace overview with all major projects
- Project-specific instructions (Dagster, D2k, Python, Spark)
- Technology stack reference
- Common tasks and best practices
- Error handling and testing guidelines

**Used by**: Claude AI (Anthropic)

### 4. `.instructions.md`
**Purpose**: Global instructions for all AI assistants  
**Contains**:
- Core principles (code quality, project awareness, documentation)
- Language-specific guidelines (Python, TypeScript, SQL)
- Data engineering best practices
- Security and version control standards
- Common patterns and checklists

**Used by**: GitHub Copilot, Cursor, and other AI assistants

### 5. `INSTRUCTIONS_COMPILATION.md`
**Purpose**: Compilation of project-specific instructions  
**Contains**:
- Dagster University project details
- Course page conventions
- D2k documentation standards
- Performance optimization tips
- Troubleshooting guide
- Security best practices

**Used by**: Reference for all AI assistants

## How These Files Work Together

```
┌─────────────────────────────────────────────────┐
│              .instructions.md                   │
│         (Global rules for all AIs)              │
└─────────────────┬───────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
┌───────▼────────┐  ┌───────▼──────────────────┐
│ .cursorrules   │  │   agent.md / claude.md   │
│ (Cursor-spec)  │  │   (AI-specific rules)    │
└────────────────┘  └──────────────────────────┘
                           │
                  ┌────────▼──────────┐
                  │ INSTRUCTIONS_     │
                  │ COMPILATION.md    │
                  │ (Project details) │
                  └───────────────────┘
```

## Which File Should You Edit?

### Edit `.cursorrules` when:
- Adding new coding standards
- Defining project-specific conventions
- Setting up linting rules

### Edit `agent.md` when:
- Changing agent behavior
- Adding new project types
- Updating workflow patterns

### Edit `claude.md` when:
- Adding detailed project context
- Documenting complex workflows
- Providing technology-specific instructions

### Edit `.instructions.md` when:
- Setting global rules for all AI assistants
- Defining workspace-wide standards
- Adding language-specific guidelines

### Edit `INSTRUCTIONS_COMPILATION.md` when:
- Documenting new projects
- Adding troubleshooting guides
- Compiling project-specific details

## File Priority

When AI assistants read these files, they typically follow this priority:

1. **`.instructions.md`** - Global rules applied first
2. **AI-specific file** (`.cursorrules`, `agent.md`, `claude.md`) - AI-specific overrides
3. **`INSTRUCTIONS_COMPILATION.md`** - Detailed project reference

## Best Practices

### Keeping Files Updated

1. **After starting a new project**: Update INSTRUCTIONS_COMPILATION.md with project structure and conventions
2. **When adopting new patterns**: Add to the appropriate file based on scope (global vs project-specific)
3. **After learning from mistakes**: Document in .cursorrules or agent.md
4. **When conventions change**: Update all relevant files

### File Organization

- Keep files focused on their specific purpose
- Avoid duplicating content across files
- Reference other files when needed
- Use clear headings and structure

### Documentation Style

- Be concise and direct
- Use code examples
- Include both "do" and "don't" examples
- Explain the "why" for non-obvious rules

## Common Scenarios

### Scenario 1: New Python Project
**What to do**:
1. Add project structure to `INSTRUCTIONS_COMPILATION.md`
2. Add any project-specific rules to `.cursorrules`
3. Update `claude.md` or `agent.md` with project context

### Scenario 2: Changing Coding Standards
**What to do**:
1. Update `.instructions.md` for global changes
2. Update language-specific sections in `.cursorrules`
3. Add examples to relevant files

### Scenario 3: New Technology Stack
**What to do**:
1. Add to technology stack section in `claude.md`
2. Add usage patterns to `INSTRUCTIONS_COMPILATION.md`
3. Update `.instructions.md` if it affects global standards

## Integration with AI Assistants

### GitHub Copilot
Reads: `.instructions.md`, `agent.md`  
Location: Workspace root or user folder

### Cursor
Reads: `.cursorrules`, `.instructions.md`  
Location: Workspace root

### Claude (API/Chat)
Reads: `claude.md`, `.instructions.md`  
Location: Referenced in prompts or workspace settings

## Memory System

In addition to these files, AI assistants use a memory system:

- **User memory** (`/memories/`): Persistent across all workspaces
- **Session memory** (`/memories/session/`): Current conversation only
- **Repository memory** (`/memories/repo/`): Repository-specific facts

These instruction files complement the memory system by providing static, versioned rules.

## Version Control

### What to Commit
✅ All instruction files  
✅ This README  
✅ Project-specific rules

### What NOT to Commit
❌ Sensitive credentials  
❌ API keys  
❌ Personal tokens

## Maintenance Schedule

**Weekly**: Review session memory for patterns to add  
**Monthly**: Review instruction files for outdated content  
**Per Project**: Update INSTRUCTIONS_COMPILATION.md with new project details  
**As Needed**: Update when you discover new patterns or best practices

## Getting Help

If AI assistants aren't following instructions:

1. **Check file location**: Files must be in workspace root
2. **Check file syntax**: Use valid Markdown
3. **Be specific**: Vague rules are hard to follow
4. **Add examples**: Show don't just tell
5. **Check priority**: Later files may override earlier ones

## Template for New Projects

When starting a new project, add this section to `INSTRUCTIONS_COMPILATION.md`:

```markdown
## Project Name

### Overview
Brief description

### Location
`/path/to/project`

### Technology Stack
- Language/Framework versions
- Key dependencies

### Setup
\`\`\`bash
# Setup commands
\`\`\`

### Conventions
- Coding style
- File organization
- Testing approach

### Special Notes
- Project-specific quirks
- Common gotchas
- Performance considerations
```

## Future Enhancements

Consider adding:
- Project-specific `.instructions.md` files in subdirectories
- Language-specific instruction files
- Team-specific conventions
- CI/CD integration rules

---

**Created**: June 3, 2026  
**Last Updated**: June 3, 2026  
**Maintained By**: Aashish Prakash
