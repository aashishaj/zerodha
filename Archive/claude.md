# Claude AI Assistant - Project Instructions

This file contains specific instructions for Claude AI when working on projects in this workspace.

## General Guidelines

### Approach
- Always read relevant code before making changes
- Provide complete, working solutions
- Explain your reasoning for complex changes
- Test your understanding by verifying file contents
- Don't give up until the task is complete

### Communication
- Be concise but thorough
- Use markdown formatting properly
- Reference files with workspace-relative paths
- Highlight important changes or considerations
- Ask for clarification only when truly necessary

## Workspace Overview

### Primary Projects

#### AI Projects (`/AI/`)
- **financial-sentiment-analyzer**: Financial news sentiment analysis
- **Finbot**: Financial chatbot with multiple checkpoints
- **llm-dockerized-module**: Dockerized LLM deployment
- **models**: LLM model download scripts

#### Data Engineering (`/D2k/`)
- **Data_Sourcing**: Data collection and ingestion
- **EWS_RETAIL**: Retail data processing
- **ext-data-subscription**: External data subscription service
  - Documentation: `/D2k/documentation/ews-data-subscription/`
- **spiders**: Web scraping projects
- **ssis**: SQL Server Integration Services packages

#### Dagster (`/Dagster/`)
- **project-dagster-university**: Learning platform with courses
  - Course content: Next.js app with Markdoc
  - Course projects: Independent Python projects
  - Package manager: `uv` only

#### Python Projects (`/Python/`)
Various utilities and data processing tools:
- Delta Lake, Polars, synthetic data generation
- MSSQL to Oracle migration tools
- Data quality and processing utilities
- SSIS to modern pipeline converters

#### Spark Projects (`/Spark/`)
- Apache Spark implementations
- Authentication utilities
- NPA movement tracking
- Spell checking applications

## Project-Specific Instructions

### Working with Dagster Projects

When modifying code in `/Dagster/project-dagster-university/`:

**Course Projects** (Python):
```bash
cd dagster_university/<course_name>
uv sync                                   # install dependencies
uv run dg dev                             # launch Dagster UI
uv run pytest tests -p no:warnings        # run tests
uv run ruff check                         # lint
```

**Course Content** (Next.js):
```bash
cd course
yarn dev          # local dev server
yarn build        # production build
yarn linkcheck    # validate links
yarn prettier     # format files
```

Important:
- Each course is an independent Python project
- Use `uv` exclusively (never pip or poetry)
- The `completed/` directory is read-only
- Student work goes in root `defs/` directory

### Documentation Standards

**D2k/ext-data-subscription**:
- All documentation in `/D2k/documentation/ews-data-subscription/`
- Never create docs in project base folder

**Dagster Course Pages**:
- Write in Markdoc format (`.md` files)
- Use frontmatter with title, module, lesson
- Follow file naming: `{number}-{kebab-case-title}.md`
- Place images in `course/public/images/{course}/{lesson}/`
- Run `yarn linkcheck` to validate

### Python Development

**Standards**:
- Python 3.10+ type hints
- PEP 8 style guide
- Descriptive names
- Docstrings for all public functions/classes
- Use `pathlib` for file operations

**Common Patterns**:
```python
from pathlib import Path
from typing import Optional
import logging

logger = logging.getLogger(__name__)

def process_data(input_path: Path, output_path: Optional[Path] = None) -> None:
    """Process data from input to output.
    
    Args:
        input_path: Path to input file
        output_path: Optional output path
    """
    try:
        # Implementation
        pass
    except Exception as e:
        logger.error(f"Error processing data: {e}")
        raise
```

**Data Processing**:
- Use pandas/polars for structured data
- DuckDB for SQL analytics on local data
- Spark for very large datasets
- Add logging for long-running operations
- Handle missing/invalid data gracefully

### Version Control

- Write descriptive commit messages
- Keep commits atomic and focused
- Never commit credentials or secrets
- Update .gitignore as needed

## Technology Stack Reference

### Primary Languages
- Python 3.10+
- TypeScript/JavaScript (Node.js)
- SQL (DuckDB, MSSQL, Oracle)

### Frameworks & Libraries
- **Orchestration**: Dagster
- **Data**: pandas, polars, DuckDB, Delta Lake
- **Spark**: PySpark
- **ML/AI**: PyTorch, Transformers, vLLM
- **Web**: Next.js, React

### Tools
- **Package Managers**: uv (Dagster), pip (Python), yarn (Node)
- **Containerization**: Docker
- **Testing**: pytest
- **Linting**: ruff (Python), ESLint (JS/TS)

## Common Tasks

### Creating New Features
1. Understand the existing codebase
2. Read related documentation
3. Plan the implementation
4. Write code with proper error handling
5. Add tests if applicable
6. Update documentation

### Debugging
1. Read error messages carefully
2. Check recent changes
3. Verify configuration and environment
4. Add logging to understand flow
5. Test fixes thoroughly

### Refactoring
1. Understand current implementation
2. Identify improvement opportunities
3. Make changes incrementally
4. Verify functionality is preserved
5. Update tests and documentation

## Best Practices

### Do
- Read code before modifying
- Use absolute paths in file operations
- Handle errors explicitly
- Log important operations
- Write self-documenting code
- Keep functions focused
- Test critical functionality

### Don't
- Assume code behavior without verifying
- Leave incomplete implementations
- Ignore error cases
- Create unnecessary files
- Commit sensitive data
- Use terminal commands to edit files (use proper file edit tools)
- Make multiple unrelated changes in one operation

## Error Handling

- Use specific exception types
- Log errors with sufficient context
- Provide helpful error messages
- Clean up resources properly (use context managers)
- Don't use bare `except:` clauses

## Performance Considerations

- Profile before optimizing
- Use appropriate data structures
- Consider memory usage for large datasets
- Stream large files instead of loading entirely
- Use batch operations where applicable

## Questions to Consider

Before implementing a solution, consider:
1. What is the user really trying to accomplish?
2. What files need to be read to understand the context?
3. What are the edge cases and error scenarios?
4. Will this solution scale appropriately?
5. Is the documentation sufficient?
6. Are there existing patterns to follow?

## When to Ask for Clarification

Only ask when:
- Requirements are genuinely ambiguous
- Multiple valid approaches exist with different tradeoffs
- User input is required (credentials, preferences)
- The request could be destructive

## Final Notes

- Trust but verify - read code to understand it
- Complete tasks fully before stopping
- Update documentation alongside code
- Think about maintainability
- Consider the user's workflow and preferences
- Make use of existing project patterns and conventions
