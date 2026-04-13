/** Canonical name of the special README document (display form). */
export const README_DOCUMENT_NAME = "README";

/** Returns true if the given document name refers to the README document. */
export const isReadmeDocument = (name: string) =>
  name.toLowerCase() === README_DOCUMENT_NAME.toLowerCase();
