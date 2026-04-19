UNIVERSAL TOP BAR NOTES

What changed
- Removed the report density selector from the shared top bar.
- The Executive Dashboard top-bar layout is now the universal top bar across the system.
- All pages now use the same top-bar sequence:
  FY · Zone · Period · Advanced Filter · Refresh · Alerts · Date/Time · Upload Data

Why
- This removes the layout difference between the Executive Dashboard and the other report pages.
- It creates one stable global top bar for the whole application.

Scope
- Directly edited: app/static/index.html
- Report density logic remains in JavaScript, but the top-bar control is no longer rendered.
