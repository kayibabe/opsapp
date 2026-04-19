TOPBAR DATETIME FORCE-INSET NOTES

Purpose
- Moves the live date/time block visibly inward from the far right edge so it is no longer clipped.

Files included
- app/static/assets/css/topbar-datetime-force-inset.css

How to apply
- Link this stylesheet after base.css and after any earlier top-bar date/time overrides.
- Or copy the CSS rules into the end of app/static/assets/css/base.css.

What it changes
- Adds stronger right padding to the right-hand top-bar action zone
- Nudges the live date/time block left using position: relative and right offset
- Forces overflow to remain visible so the text is not clipped
