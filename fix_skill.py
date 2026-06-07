import os

path = r'd:\goworkspace\src\aidk\dev-launcher\.codebuddy\skills\dev-launcher\SKILL.md'

# Read as utf-8, replacing invalid bytes with the replacement character
with open(path, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Fix all mangled characters
fixes = [
    ('Rust ? frontend', 'Rust \u2194 frontend'),
    ('// ? Inside React', '// \u2705 Inside React'),
    ('// ? Async callbacks', '// \u2705 Async callbacks'),
    ('// ? Effects needing', '// \u2705 Effects needing'),
    ('// ?\n   const LABELS', '// \u2705\n   const LABELS'),
    ('// ? Scattered', '// \u274C Scattered'),
]

fixed_count = 0
for old, new in fixes:
    if old in content:
        content = content.replace(old, new)
        fixed_count += 1
        # Don't print the Unicode chars to console
        print(f'Fixed one item')
    else:
        print(f'Not found: {repr(old[:20])}...')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Done! Fixed {fixed_count} items. File written as UTF-8.')

# Verify by reading back
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()
print('Line 22 ok:', '\u2194' in lines[21] or 'Rust' in lines[21][:50])
print('Line 118 ok:', '\u2705' in lines[117] or '//' in lines[117][:20])
print('Line 289 ok:', '\u2705' in lines[288] or '//' in lines[288][:20])
