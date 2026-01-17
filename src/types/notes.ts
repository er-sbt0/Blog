export interface Note {
  id: string;
  position: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
  title?: string; // Optional note title
  content: string; // Serialized Lexical editor state
  color: string;
  zIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface NotesCanvas {
  id: string;
  name: string;
  notes: Note[];
  createdAt: number;
  updatedAt: number;
}
