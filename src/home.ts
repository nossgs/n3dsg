import './home.css';

export function showHomeScreen(onPlay: () => void): void {
  const home = document.createElement('main');
  home.id = 'home-screen';
  home.innerHTML = `
    <section class="home-panel" aria-labelledby="home-title">
      <p class="home-eyebrow">A post-collapse survival world</p>
      <h1 id="home-title">n3dsg</h1>
      <p class="home-description">Find your own way to live.</p>
      <button id="home-play" type="button">Play</button>
      <p class="home-controls">WASD to move · Mouse to look<br>Escape releases the mouse</p>
      <p class="home-version">Early development · No save system yet</p>
    </section>`;
  document.body.appendChild(home);
  const hint = document.getElementById('hint');
  if (hint) hint.hidden = true;
  const play = home.querySelector<HTMLButtonElement>('#home-play')!;
  play.addEventListener('click', () => {
    home.remove();
    if (hint) hint.hidden = false;
    onPlay();
  }, { once: true });
  play.focus();
}
