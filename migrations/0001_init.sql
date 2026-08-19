CREATE TABLE kanji (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kanji TEXT NOT NULL UNIQUE,
  stroke_count INTEGER NOT NULL,
  meaning TEXT NOT NULL,
  grade INTEGER NOT NULL,
  kunyomi_ja TEXT,
  kunyomi TEXT,
  onyomi_ja TEXT,
  onyomi TEXT,
  examples TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_kanji_grade ON kanji (grade);
CREATE INDEX idx_kanji_stroke_count ON kanji (stroke_count);
