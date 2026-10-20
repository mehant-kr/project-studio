# Pindrop Studio for iPhone: dark design

This is the approved design for the iPhone app. Each `.dc.html` file is one screen.
The live clickable version is https://claude.ai/artifact/GUTAjyU9TjzEwHHAKbmfxb

| File | Screen |
| --- | --- |
| Main.dc.html | Today (home) |
| Tasks.dc.html | My Tasks |
| Detail.dc.html | Task detail |
| QuickAdd.dc.html | Quick add sheet |
| Menu.dc.html | Long-press menu |
| Projects.dc.html | Projects |
| Board.dc.html | Project board |
| Inbox.dc.html | Inbox |
| Settings.dc.html | Settings |
| Lock.dc.html | Lock Screen (notification/widget idea) |
| Calendar.dc.html | Calendar (month grid and day agenda) |
| Timeline.dc.html | Timeline (Gantt, Week/Month zoom) |

Every main screen shares these elements:
- **Liquid-glass tab bar:** floating; `left:14px; right:90px; bottom:26px; height:66px; border-radius:33px`; a gradient glass fill with `backdrop-filter: blur(24px) saturate(1.8)`.
- **Liquid-glass + button:** a 66px circle in indigo glass at `right:14px; bottom:26px`. It opens Quick add.

## Implementation plan
Build one screen at a time, starting with **Today**. Status:

- [x] Today
- [ ] My Tasks
- [ ] Task detail
- [ ] Quick add
- [ ] Long-press menu
- [ ] Projects
- [ ] Project board
- [ ] Inbox
- [ ] Settings
- [ ] Calendar
- [ ] Timeline

### Where the code goes
- **Branches:** UI work happens on `main`, then `git switch tauri && git merge main`. The iPhone build is made from `tauri`.
- **Phone screens:** `src/pages/phone.js` (mHome, mMyTasks, mProjects, mInbox; `phoneScreen(route)`, `isPhone()` ≤640px) and `src/styles/pages/phone.css`. The shell is `src/shell/layout.js` (the .fab button, the bottom nav).
- **Touch:** `src/actions/touch-drag.js`, `touch-swipe.js`, `touch-sheet.js` and `src/core/haptics.js`.
- **iPhone install:** build on `tauri` with `npm run ios:build` (or through Xcode), then install on the user's iPhone.
