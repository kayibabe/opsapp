Removed the duplicated user-information chip from the top bar.

Directly edited:
- app/static/index.html

Change made:
- removed the top-bar user avatar, name, and role block
- kept the bottom sidebar user card as the single visible identity area
- left JavaScript user-binding logic intact because it already fails safely when the top-bar elements are absent
