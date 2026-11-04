# Navigation checks

Serve the repository locally (`python3 -m http.server 8000`) and open
`http://localhost:8000/tests/navigation.html` in a clean browser profile, then
select **Run checks**. The runner refuses non-local origins and connected accounts.
It temporarily hides the privacy overlay inside the fixture without recording consent.

The browser checks layout at 320, 393, 430 and 768 CSS pixels in light/dark themes,
menu target sizes and separation, three circular settings actions, idle pager
visibility, rapid navigation, native-back routing, keyboard dismissal, editor
opening, year/week/month layout, injected 59/34px safe areas, and synthetic swipe
completion/cancellation/interruption. No events are saved and no account is connected.

These checks exercise the shared web UI. Android hardware haptics, OS insets and
performance, and iOS/macOS native rendering still need device verification.
