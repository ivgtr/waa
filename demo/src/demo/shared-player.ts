import { WaaPlayer } from "waa";

let _player: WaaPlayer | null = null;

export function getSharedPlayer(): WaaPlayer {
  if (!_player) {
    _player = new WaaPlayer();
  }
  return _player;
}

export function disposeSharedPlayer(): void {
  if (_player) {
    _player.dispose();
    _player = null;
  }
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs.toFixed(1)}`;
}
