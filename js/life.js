/* ============================================================
   life.js — Life view (workspace + avatar placeholder)
   Pure presentation. A natural home for the future avatar /
   room system. No business logic yet.
   ============================================================ */

export function render(root) {
  root.innerHTML = `
    <div class="card">
      <div class="card-header"><div><h3>Life Workspace</h3><p>Your visual workspace. Categories and avatar will appear here.</p></div></div>
      <div class="avatar-room-viewport">
        <div class="blueprint-grid-overlay"></div>
        <div class="full-body-canvas-placeholder">
          <div class="blueprint-floor"></div>
          <div class="avatar-label-glow"><span class="pulse-dot"></span>Avatar &amp; Room Space</div>
        </div>
      </div>
    </div>`;
}
