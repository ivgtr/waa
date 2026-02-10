// ---------------------------------------------------------------------------
// Stretcher: Constants
// ---------------------------------------------------------------------------

// Chunk splitting
export const CHUNK_DURATION_SEC = 8;
export const OVERLAP_SEC = 0.2;
export const CROSSFADE_SEC = 0.1;

// WSOLA algorithm parameters
export const WSOLA_FRAME_SIZE = 1024;
export const WSOLA_HOP_SIZE = 512;
export const WSOLA_TOLERANCE = 2048;

// Priority scheduling weights
export const PRIORITY_FORWARD_WEIGHT = 1.0;
export const PRIORITY_BACKWARD_WEIGHT = 2.5;
export const CANCEL_DISTANCE_THRESHOLD = 6;

// Buffer health thresholds (seconds)
export const BUFFER_HEALTHY_SEC = 30;
export const BUFFER_LOW_SEC = 10;
export const BUFFER_CRITICAL_SEC = 3;
export const BUFFER_RESUME_SEC = 5;

// Memory management
export const KEEP_AHEAD_CHUNKS = 19;
export const KEEP_AHEAD_SECONDS = 150;
export const KEEP_BEHIND_CHUNKS = 8;
export const KEEP_BEHIND_SECONDS = 60;

// Worker pool
export const WORKER_POOL_SIZE = 2;

// Error recovery
export const MAX_WORKER_CRASHES = 3;
export const MAX_CHUNK_RETRIES = 3;

// Estimation
export const ESTIMATOR_WINDOW_SIZE = 10;

// Playback lookahead
export const LOOKAHEAD_INTERVAL_MS = 200;
export const LOOKAHEAD_THRESHOLD_SEC = 3.0;
export const PROACTIVE_SCHEDULE_THRESHOLD_SEC = 5.0;
