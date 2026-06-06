# AI Agent Instructions - Aashish Prakash's Workspace

## Core Principles

### Communication Style
- Be concise and direct
- Provide complete solutions, not just suggestions
- Explain complex changes but keep it brief
- Use proper markdown formatting with code blocks
- Reference specific files with line numbers when relevant

### Code Implementation
- Implement changes directly rather than just suggesting them
- If intent is unclear, infer the most useful action and proceed
- Research thoroughly before giving up on a task
- Work until the task is completely resolved
- Don't stop when encountering uncertainty - research and deduce

### File Operations
- Always use absolute file paths
- Check if files exist before modifying
- Read sufficient context before making changes
- Use multi-file edit operations when making multiple independent changes

## Project Context

### Workspace Structure
Primary project areas:
- **AI/**: Machine learning and AI projects (financial sentiment analyzer, Finbot, LLM modules)
- **D2k/**: Data sourcing and processing pipelines
- **Dagster/**: Dagster learning projects and implementations
- **Python/**: Various Python utilities and data processing tools
- **Spark/**: Apache Spark projects

### Technology Stack
- **Python**: Primary language for data processing, AI/ML
- **Dagster**: Workflow orchestration
- **Apache Spark**: Large-scale data processing
- **DuckDB**: SQL analytics
- **Docker**: Containerization
- **Next.js**: Web applications (Dagster course content)

### Package Managers
- **Dagster projects**: Use `uv` exclusively (never pip or poetry)
- **Python projects**: Virtual environments with pip
- **Node.js projects**: yarn or npm

## Specific Instructions

### Documentation
- For D2k/ext-data-subscription: Place docs in `/Users/aashishprakash/Projects/D2k/documentation/ews-data-subscription/`
- Keep documentation close to code unless project has specific documentation folder
- Use markdown for all documentation files
- Include examples and usage patterns

### Dagster Projects
When working on Dagster projects:
1. Always `cd` into the specific course directory first
2. Use `uv sync` to install dependencies
3. Run commands with `uv run` prefix
4. The `completed/` directories are reference only - don't modify
5. Work in the root `defs/` directory for student implementations

### Data Processing
- Add logging for important processing steps
- Include error handling for data quality issues
- Document data transformations clearly
- Consider memory usage for large datasets
- Use appropriate data structures (pandas, polars, duckdb)

### Code Quality
- Include type hints in Python code
- Write docstrings for functions and classes
- Follow PEP 8 style guidelines
- Keep functions focused and testable
- Add unit tests for critical logic

### File Management
- Use `pathlib` for file path operations in Python
- Handle file I/O errors gracefully
- Clean up temporary files
- Document file format expectations

### Version Control
- Make atomic commits
- Write clear commit messages
- Don't commit sensitive data
- Keep `.gitignore` updated

## Problem-Solving Approach

1. **Understand**: Read existing code and documentation thoroughly
2. **Plan**: Break complex tasks into manageable steps
3. **Implement**: Make changes with proper error handling
4. **Verify**: Check that changes work as expected
5. **Document**: Update documentation as needed

## Common Patterns

### Python Scripts
```python
from pathlib import Path
from typing import Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main() -> None:
    """Main entry point."""
    try:
        # Implementation
        pass
    except Exception as e:
        logger.error(f"Error: {e}")
        raise

if __name__ == "__main__":
    main()
```

### Data Processing
- Use pandas/polars for structured data
- Use DuckDB for SQL analytics
- Consider Spark for very large datasets
- Add progress logging for long-running operations

### Configuration
- Use environment variables for configuration
- Provide sensible defaults
- Validate configuration at startup
- Document all configuration options

## Things to Avoid

- Don't make assumptions - verify by reading code
- Don't suggest running terminal commands to edit files
- Don't create unnecessary files
- Don't leave incomplete implementations
- Don't ignore error handling
- Don't commit secrets or credentials
