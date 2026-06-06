# Project-Specific Instructions Compilation

This file contains project-specific instructions extracted from various projects in the workspace.

---

## Dagster University Project

### Repository Overview

**Location**: `/Users/aashishprakash/Projects/Dagster/project-dagster-university/`

An educational platform with two independent parts:
- Dagster course projects (Python)
- Course-content web app (Next.js)

### Repository Structure

```
course/                          # Next.js/Markdoc web app (courses.dagster.io)
    pages/
        dagster_essentials/      # Course: Dagster fundamentals
        dagster_and_dbt/         # Course: Dagster + dbt
        dagster_and_etl/         # Course: ETL pipelines
        ...
dagster_university/
    dagster_essentials/          # Course: Dagster fundamentals
    dagster_and_dbt/             # Course: Dagster + dbt
    dagster_and_etl/             # Course: ETL pipelines
    ...
```

### Working on a Dagster Course

Each course is an **independent Python project** — there is no root-level Python environment. Always `cd` into the course directory first.

**Package manager:** `uv` (never `pip` or `poetry`)

```bash
cd dagster_university/<course_name>

uv sync                                   # install dependencies
uv run dg dev                             # launch Dagster UI
uv run pytest tests -p no:warnings        # run tests
uv run ruff check                         # lint
```

### Course Project Layout

```
src/<course_name>/
    definitions.py        # root Definitions object
    defs/
        assets/           # asset definitions
    completed/            # reference implementations per lesson — do not modify
        lesson_4/         # matches lesson 4 of the content in course/pages/course_name
                          # completed lessons only correspond to pages/ that have code 
            defs/
        lesson_5/
            defs/
        ...
tests/
```

The `completed/` directory contains the finished code for each lesson. It exists for student reference, treat it as read-only. The root defs/ directory is the student's working area for the course.

### Working on the Web App

Course content is written in Markdoc (`.md` files under `course/pages/`).

**Package manager:** `yarn` (v4.5.0)

```bash
cd course

yarn dev          # local dev server
yarn build        # production build
yarn lint         # ESLint
yarn linkcheck    # validate internal and external links
yarn prettier     # format all files
```

### Running All Course Tests

```bash
make test_all     # from repo root — runs pytest for all courses
```

### CI/CD

Each course has GitHub Actions workflows that run `uv sync` → `ruff check` → `pytest` on Ubuntu and Windows across Python 3.10–3.13.

---

## Dagster Course Pages: Conventions

### Frontmatter

Every lesson file requires these fields:

```yaml
---
title: "Lesson X: Page Title"
module: 'module_slug'
lesson: 'X'
---
```

**Module slugs:**
- `dagster-essentials` → `dagster_essentials`
- `dagster-dbt` → `dbt_dagster`
- `dagster-etl` → `dagster_etl`
- `dagster-testing` → `dagster_testing`
- `ai-driven-data-engineering` → `ai_driven_data_engineering`

`lesson` must be a string (e.g., `'3'`, not `3`).

### File Naming

`{number}-{kebab-case-title}.md`, e.g., `3-asset-materialization.md`

Numbers start at 0 (overview). Numbers establish navigation order within a lesson directory.

### Writing Style

- Concise, direct prose — no filler
- Short paragraphs
- `##` for section headers, `###` for subsections
- No emojis, no em dashes
- Active voice

### Markdoc Syntax

- Triple-backtick code blocks with language tag
- Prefer CommonMark tables; Markdoc `{% table %}` available for complex tables

### Pages

The first sub lesson in lesson-1 should be `0-about-this-course.md`

Examples:
- `course/pages/dagster-etl/lesson-1/0-about-this-course.md`
- `course/pages/dagster-testing/lesson-1/0-about-this-course.md`

In all other lessons, the first sub lesson should be `0-overview.md`

Examples:
- `course/pages/dagster-essentials/lesson-3/0-overview.md`

### Images

The images are contained within `course/public/images` which is organized by courses and lesson numbers. All images should be:

```markdown
![Image description](/images/{course name}/{lesson number}/{image name}.png)
```

### Validation

Run `yarn linkcheck` from `course/` to verify internal and external links before finalizing.

### Index Files

When a new lesson is added or a lesson number is updated, update the corresponding index `.md` file.

Examples:
- `course/pages/dagster-essentials.md`
- `course/pages/dagster-etl.md`

---

## D2k/ext-data-subscription Documentation

### Documentation Location

**All documentation** for the ext-data-subscription project must be created in:
`/Users/aashishprakash/Projects/D2k/documentation/ews-data-subscription/`

**Never** create documentation in the project base folder.

---

## Additional Project Notes

### Python Projects Structure

Most Python projects follow this structure:
```
project_name/
    README.md
    requirements.txt
    setup.py (if applicable)
    src/
        project_name/
            __init__.py
            main.py
            ...
    tests/
        test_main.py
        ...
    data/ (optional)
    docs/ (optional)
```

### Common Tools and Technologies

**Data Processing:**
- pandas, polars: DataFrames
- DuckDB: SQL analytics
- Apache Spark (PySpark): Large-scale processing
- Delta Lake: Data lakehouse

**Workflow Orchestration:**
- Dagster: Asset-based orchestration
- Apache Airflow: DAG-based workflows

**AI/ML:**
- PyTorch, Transformers: Model training and inference
- vLLM: LLM serving
- sentence-transformers: Embeddings

**Web:**
- Next.js: React framework
- Markdoc: Documentation

**Databases:**
- DuckDB: Analytics
- SQL Server: Enterprise database
- Oracle: Enterprise database

### Environment Management

**Python:**
```bash
python -m venv venv
source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
```

**Dagster (uv):**
```bash
cd dagster_university/<course>
uv sync
uv run <command>
```

**Node.js:**
```bash
yarn install  # or npm install
yarn dev      # or npm run dev
```

### Testing Patterns

**Python (pytest):**
```python
import pytest
from pathlib import Path

def test_function_success():
    """Test successful case."""
    result = my_function(valid_input)
    assert result == expected_output

def test_function_error():
    """Test error handling."""
    with pytest.raises(ValueError):
        my_function(invalid_input)
```

**Jest/Vitest (JavaScript/TypeScript):**
```typescript
import { describe, it, expect } from 'vitest'

describe('MyComponent', () => {
  it('renders correctly', () => {
    const result = render(<MyComponent />)
    expect(result).toBeDefined()
  })
})
```

---

## Git Workflow

### Common Commands

```bash
# Start new feature
git checkout -b feature/new-feature

# Stage and commit
git add .
git commit -m "feat: Add new feature"

# Push to remote
git push origin feature/new-feature

# Update from main
git checkout main
git pull
git checkout feature/new-feature
git rebase main
```

### Commit Message Format

```
<type>: <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Test additions/changes
- `chore`: Maintenance tasks

---

## Performance Optimization Tips

### Python Data Processing

1. **Use appropriate tools:**
   - Small data (< 100MB): pandas
   - Medium data (< 10GB): polars or DuckDB
   - Large data (> 10GB): Spark

2. **Stream large files:**
```python
# Good: Stream processing
for chunk in pd.read_csv('large_file.csv', chunksize=10000):
    process(chunk)

# Bad: Load everything
df = pd.read_csv('large_file.csv')  # OOM risk
```

3. **Use vectorized operations:**
```python
# Good
df['result'] = df['a'] * df['b']

# Bad
df['result'] = df.apply(lambda row: row['a'] * row['b'], axis=1)
```

### Spark Optimization

1. Partition appropriately
2. Use broadcast joins for small tables
3. Persist intermediate results
4. Avoid collect() on large datasets
5. Use column pruning

---

## Troubleshooting Guide

### Python Import Errors

```bash
# Check Python path
python -c "import sys; print('\n'.join(sys.path))"

# Reinstall package
pip uninstall package_name
pip install package_name

# Install in editable mode (development)
pip install -e .
```

### Dagster Issues

```bash
# Clear cache
rm -rf ~/.dagster

# Restart daemon
dagster-daemon run

# Check definitions
uv run dg dev --verbose
```

### Node.js/Yarn Issues

```bash
# Clear cache
yarn cache clean
rm -rf node_modules
yarn install

# Use specific node version (nvm)
nvm use 18
yarn install
```

---

## Security Best Practices

### Environment Variables

Never commit secrets. Use environment variables:

```python
import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv('API_KEY')
if not API_KEY:
    raise ValueError("API_KEY not set")
```

### .gitignore Essentials

```gitignore
# Credentials
.env
.env.local
*.key
*.pem

# Python
__pycache__/
*.py[cod]
venv/
.venv/

# Node
node_modules/
.next/

# IDEs
.vscode/
.idea/
*.swp

# OS
.DS_Store
```

---

## Documentation Standards

### README Template

```markdown
# Project Name

Brief description of what this project does.

## Installation

\`\`\`bash
# Installation commands
\`\`\`

## Usage

\`\`\`python
# Example usage
\`\`\`

## Configuration

Environment variables:
- `VAR_NAME`: Description

## Development

\`\`\`bash
# Setup dev environment
# Run tests
\`\`\`

## License

License information
```

### Code Documentation

```python
def process_data(
    input_path: Path,
    output_path: Path,
    validate: bool = True
) -> int:
    """Process data from input file to output file.
    
    Args:
        input_path: Path to input CSV file
        output_path: Path to output parquet file
        validate: Whether to validate data quality
        
    Returns:
        Number of records processed
        
    Raises:
        FileNotFoundError: If input_path doesn't exist
        ValueError: If data validation fails
        
    Example:
        >>> process_data(Path('in.csv'), Path('out.parquet'))
        1000
    """
    ...
```

---

This compilation provides a comprehensive reference for working across all projects in the workspace.
