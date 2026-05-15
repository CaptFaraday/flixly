import './Detail.css';
import { useEffect } from 'preact/hooks';
import { useFocusable } from '../nav/useFocusable';
import { TopNav } from '../components/TopNav';
import type { Movie } from '../types';
import { toggleWatchlist, watchlist, settings } from '../state/store';
import { fetchTorrentioCandidates } from '../sources/torrentio';
import { fetchSubtitlesByImdb } from '../subtitles/opensubtitles';

interface Props {
  movie: Movie;
  onPlay: () => void;
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
}

export function Detail({ movie, onPlay, onNavigate }: Props) {
  // Pre-warm the JSON caches while the user is reading the Detail page.
  // Both calls are small (~10-30 KB JSON each), don't compete for playback
  // bandwidth, and let Stage 1 of the player drop from ~1.4s to ~50ms
  // when the user presses Play.
  //
  // We deliberately do NOT pre-warm the actual stream bytes. A/B testing on
  // this TV showed bytes-prewarm adds 5+ seconds rather than removing them
  // — likely because TorBox's CDN load-balances each request to a different
  // nexus-NNN node, so warming node A doesn't help when the play request
  // hits node B. The cost (parallel bandwidth, slow node selection) is
  // real; the benefit didn't materialize.
  useEffect(() => {
    const s = settings.value;
    void fetchTorrentioCandidates(movie.imdb_id, { torbox: s.torbox_api_key, realdebrid: s.rd_api_key });
    if (s.require_subtitles) void fetchSubtitlesByImdb(movie.imdb_id, 'eng');
  }, [movie.imdb_id]);

  const playBtn = useFocusable({ id: 'detail-play', onActivate: onPlay, autofocus: true });
  const watchBtn = useFocusable({ id: 'detail-watch', onActivate: () => toggleWatchlist(movie.imdb_id) });
  const inList = watchlist.value.includes(movie.imdb_id);
  const { ref: playRef, ...playRest } = playBtn;
  const { ref: watchRef, ...watchRest } = watchBtn;

  return (
    <>
      <TopNav current="home" onNavigate={onNavigate} />
      <div className="detail__hero" data-screen="detail" style={{ backgroundImage: `url(${movie.backdrop})` }}>
        <div className="detail__overlay" />
      </div>
      <div className="detail__content">
        <h1 className="detail__title">{movie.title}</h1>
        <div className="detail__meta">
          <span className="detail__meta-item">{movie.year}</span>
          <span className="detail__meta-item">{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>
          {movie.scores.rt != null && <span className="detail__meta-item detail__meta-item--rt">{movie.scores.rt}% RT</span>}
          {movie.director && <span className="detail__meta-item">Dir. {movie.director}</span>}
        </div>
        <p className="detail__overview">{movie.overview}</p>
        <div className="detail__btns">
          <span ref={playRef as any} {...playRest} className="detail__btn detail__btn--primary">▶ Play</span>
          <span ref={watchRef as any} {...watchRest} className="detail__btn detail__btn--secondary">{inList ? '✓ In Watchlist' : '+ Watchlist'}</span>
        </div>
        {movie.cast.length > 0 && (
          <div className="detail__cast">
            <div className="detail__cast-label">Cast</div>
            <div className="detail__cast-names">{movie.cast.join(' · ')}</div>
          </div>
        )}
      </div>
    </>
  );
}
