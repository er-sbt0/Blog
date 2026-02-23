/**
 * Test Cases for extractCollaborators utility
 *
 * This file documents the expected behavior of the extractCollaborators function.
 * To run these tests, set up a testing framework like Jest or Vitest.
 *
 * Installation:
 *   npm install --save-dev jest @types/jest ts-jest
 *   npm install --save-dev vitest
 */

import { extractCollaborators } from "../collaborators";
import { CloudDocumentRevision, User } from "@/types";

// Mock data helpers
const createMockUser = (id: string, name: string): User => ({
  id,
  handle: `${name.toLowerCase()}`,
  name,
  email: `${name.toLowerCase()}@example.com`,
  image: null,
});

const createMockRevision = (
  id: string,
  author: User,
): CloudDocumentRevision => ({
  id,
  documentId: "doc1",
  author,
  createdAt: new Date().toISOString(),
});

/**
 * Test Case 1: Empty revisions array
 * Expected: Returns empty array
 */
export function testEmptyRevisions() {
  const author = createMockUser("author1", "Author");
  const result = extractCollaborators([], author.id);
  console.assert(
    result.length === 0,
    "Should return empty array for empty revisions",
  );
}

/**
 * Test Case 2: Excludes the primary author
 * Expected: Author is not included in collaborators list
 */
export function testExcludesPrimaryAuthor() {
  const author = createMockUser("author1", "Author");
  const user1 = createMockUser("user1", "User One");

  const revisions = [
    createMockRevision("rev1", author),
    createMockRevision("rev2", user1),
  ];

  const result = extractCollaborators(revisions, author.id);
  console.assert(result.length === 1, "Should have 1 collaborator");
  console.assert(result[0].id === user1.id, "Should be user1");
}

/**
 * Test Case 3: Removes duplicate collaborators
 * Expected: Each collaborator appears only once
 */
export function testRemovesDuplicates() {
  const author = createMockUser("author1", "Author");
  const user1 = createMockUser("user1", "User One");
  const user2 = createMockUser("user2", "User Two");

  const revisions = [
    createMockRevision("rev1", user1),
    createMockRevision("rev2", user1),
    createMockRevision("rev3", user2),
    createMockRevision("rev4", user1),
  ];

  const result = extractCollaborators(revisions, author.id);
  console.assert(result.length === 2, "Should have 2 unique collaborators");
  console.assert(result[0].id === user1.id, "First should be user1");
  console.assert(result[1].id === user2.id, "Second should be user2");
}

/**
 * Test Case 4: Excludes users in the excludeUserIds list
 * Expected: Excluded users are not in the result
 */
export function testExcludesUserIds() {
  const author = createMockUser("author1", "Author");
  const user1 = createMockUser("user1", "User One");
  const user2 = createMockUser("user2", "User Two");
  const user3 = createMockUser("user3", "User Three");

  const revisions = [
    createMockRevision("rev1", user1),
    createMockRevision("rev2", user2),
    createMockRevision("rev3", user3),
  ];

  const result = extractCollaborators(revisions, author.id, [user2.id]);

  console.assert(result.length === 2, "Should have 2 collaborators");
  console.assert(
    !result.find((u) => u.id === user2.id),
    "user2 should be excluded",
  );
  console.assert(
    !!result.find((u) => u.id === user1.id),
    "user1 should be included",
  );
  console.assert(
    !!result.find((u) => u.id === user3.id),
    "user3 should be included",
  );
}

/**
 * Test Case 5: Handles multiple excluded users (e.g., coauthors)
 * Expected: All excluded users are filtered out
 */
export function testMultipleExcludedUsers() {
  const author = createMockUser("author1", "Author");
  const user1 = createMockUser("user1", "User One");
  const user2 = createMockUser("user2", "User Two");
  const user3 = createMockUser("user3", "User Three");
  const coauthor1 = createMockUser("coauthor1", "Coauthor One");
  const coauthor2 = createMockUser("coauthor2", "Coauthor Two");

  const revisions = [
    createMockRevision("rev1", user1),
    createMockRevision("rev2", coauthor1),
    createMockRevision("rev3", user2),
    createMockRevision("rev4", coauthor2),
    createMockRevision("rev5", user3),
  ];

  const result = extractCollaborators(
    revisions,
    author.id,
    [coauthor1.id, coauthor2.id],
  );

  console.assert(result.length === 3, "Should have 3 collaborators");
  console.assert(
    !result.find((u) => u.id === coauthor1.id),
    "coauthor1 should be excluded",
  );
  console.assert(
    !result.find((u) => u.id === coauthor2.id),
    "coauthor2 should be excluded",
  );
}

/**
 * Test Case 6: Preserves order of first appearance
 * Expected: Collaborators are in the order they first appear in revisions
 */
export function testPreservesOrder() {
  const author = createMockUser("author1", "Author");
  const user1 = createMockUser("user1", "User One");
  const user2 = createMockUser("user2", "User Two");
  const user3 = createMockUser("user3", "User Three");

  const revisions = [
    createMockRevision("rev1", user2),
    createMockRevision("rev2", user1),
    createMockRevision("rev3", user2), // duplicate
    createMockRevision("rev4", user3),
  ];

  const result = extractCollaborators(revisions, author.id);
  console.assert(result.length === 3, "Should have 3 collaborators");
  console.assert(result[0].id === user2.id, "First should be user2");
  console.assert(result[1].id === user1.id, "Second should be user1");
  console.assert(result[2].id === user3.id, "Third should be user3");
}

/**
 * Test Case 7: Handles revisions with null authors gracefully
 * Expected: Null authors are skipped without errors
 */
export function testNullAuthors() {
  const author = createMockUser("author1", "Author");
  const user1 = createMockUser("user1", "User One");
  const user2 = createMockUser("user2", "User Two");

  const revisions = [
    createMockRevision("rev1", user1),
    {
      id: "rev2",
      documentId: "doc1",
      author: null as any,
      createdAt: new Date().toISOString(),
    },
    createMockRevision("rev3", user2),
  ] as CloudDocumentRevision[];

  const result = extractCollaborators(revisions, author.id);
  console.assert(result.length === 2, "Should have 2 collaborators");
  console.assert(result[0].id === user1.id, "First should be user1");
  console.assert(result[1].id === user2.id, "Second should be user2");
}

// Run all tests (when testing framework is available, this can be replaced with proper test runner)
export function runAllTests() {
  testEmptyRevisions();
  testExcludesPrimaryAuthor();
  testRemovesDuplicates();
  testExcludesUserIds();
  testMultipleExcludedUsers();
  testPreservesOrder();
  testNullAuthors();
}
