import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { z } from "zod";
import 'dotenv/config';

class PaperlessClient {
    private readonly baseUrl: string;
    private readonly apiKey: string;

    constructor(baseUrl: string, apiKey: string) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }

    private buildUrl(
        query?: string,
        tags?: string[],
        ordering?: string,
        documentId?: number,
        added_after?: string,
        added_before?: string
    ): string {
        let url = `${this.baseUrl}/api/documents/`;

        if (query) {
            url += `?query=${encodeURIComponent(query)}`;
        }

        if (tags && tags.length > 0) {
            for (const tag of tags) {
                url += (url.includes('?') ? '&' : '?') + `tags__name__icontains=${encodeURIComponent(tag)}`;
            }
        }

        if (documentId) {
            url += (url.includes('?') ? '&' : '?') + `id=${documentId}`;
        }
        if (added_after) {
            url += (url.includes('?') ? '&' : '?') + `added__gte=${added_after}`;
        }
        if (added_before) {
            url += (url.includes('?') ? '&' : '?') + `added__lte=${added_before}`;
        }
        if (ordering) {
            url += (url.includes('?') ? '&' : '?') + `ordering=${ordering}`;
        }

        return url;
    }

    private async get(apiUrl: string): Promise<any> {
        try {
            const response = await axios.get(apiUrl, {
                headers: { 'Authorization': `Token ${this.apiKey}` }
            });
            return response.data;
        } catch (e) {
            if (axios.isAxiosError(e) && e.response?.status === 401) {
                throw new Error(`Unauthorized: Please check your API key`);
            }
            throw e;
        }
    }

    async getDocuments(
        query?: string,
        tags?: string[],
        ordering?: string,
        documentId?: number,
        added_after?: string,
        added_before?: string
    ): Promise<any> {
        const apiUrl = this.buildUrl(query, tags, ordering, documentId, added_after, added_before);
        return this.get(apiUrl);
    }

    async getDocumentById(id: number): Promise<{
        id: number;
        title: string;
        created: string;
        content: string;
    }> {
        const url = `${this.baseUrl}/api/documents/${id}/`;
        const d = await this.get(url);
        return {
            id: d.id,
            title: d.title,
            created: d.created,
            content: d.content ?? '',
        };
    }

    async getTagNames(tagIds: number[]): Promise<Map<number, string>> {
        if (tagIds.length === 0) return new Map();
        const url = `${this.baseUrl}/api/tags/?page_size=500`;
        const data = await this.get(url);
        const map = new Map<number, string>();
        for (const tag of data.results) {
            map.set(tag.id, tag.name);
        }
        return map;
    }

    async searchTags(query: string): Promise<{
        matchCount: number;
        info: { tagId: number; name: string; count: number }[];
    }> {
        const url = `${this.baseUrl}/api/tags/?name__icontains=${encodeURIComponent(query)}`;
        try {
            const data = await this.get(url);
            const info = data.results.map((t: any) => ({
                tagId: t.id,
                name: t.name,
                count: t.document_count,
            }));
            return { matchCount: data.count, info };
        } catch (e) {
            console.error(`Error with tag search: ${e}`);
            throw e;
        }
    }
}

export const server = new McpServer({
    name: 'Paperless-ngx-MCP-Server',
    version: '2.0.0'
});

const paperlessUrl = process.env.PAPERLESS_URL || 'http://localhost:8000';
const paperlessApiKey = process.env.PAPERLESS_API_KEY;
if (!paperlessApiKey || paperlessApiKey.trim() === '') {
    throw new Error('Missing Paperless-ngx API Key');
}

const paperless = new PaperlessClient(paperlessUrl, paperlessApiKey);

// Tool 1: search_documents
server.registerTool(
    'search_documents',
    {
        title: 'Search Documents',
        description:
            'START HERE for any document-related task. Searches Paperless-ngx and returns a list of matching documents with their ID, title, date, and tag names. Use the returned document IDs to fetch full text content with `get_document_content`. If you need to search by tag name but are not sure of the exact name, call `search_tags` first.',
        inputSchema: {
            query: z.string().optional()
                .describe('Full-text search across document content and title.'),
            tags: z.array(z.string()).optional()
                .describe('Filter by one or more tag names (case-insensitive substring match, OR logic).'),
            document_id: z.number().optional()
                .describe('Fetch a specific document by its numeric ID.'),
            added_after: z.string().optional()
                .describe('ISO 8601 date. Return documents added on or after this date (e.g. 2024-01-01).'),
            added_before: z.string().optional()
                .describe('ISO 8601 date. Return documents added on or before this date.'),
            ordering: z.string().optional()
                .describe('Sort field. Examples: -created (newest first), title, added.'),
        },
    },
    async ({ query, tags, document_id, added_after, added_before, ordering }) => {
        try {
            const raw = await paperless.getDocuments(query, tags, ordering, document_id, added_after, added_before);

            const results: any[] = Array.isArray(raw?.results) ? raw.results : Array.isArray(raw) ? raw : raw ? [raw] : [];

            const allTagIds = [...new Set(results.flatMap((d: any) => d.tags ?? []))];
            const tagMap = await paperless.getTagNames(allTagIds);

            const documents = results.map((d: any) => ({
                id: d.id,
                title: d.title,
                created: d.created,
                added: d.added,
                tags: (d.tags ?? []).map((id: number) => tagMap.get(id) ?? String(id)),
            }));

            const output = { count: raw?.count ?? documents.length, documents };

            return {
                content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
                structuredContent: output,
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text', text: `Error: ${error?.message ?? 'Error while searching documents.'}` }],
            };
        }
    }
);

// Tool 2: get_document_content
server.registerTool(
    'get_document_content',
    {
        title: 'Get Document Content',
        description:
            'Fetches the full OCR text content of one or more documents by their numeric IDs. Use this after `search_documents` to read the actual text of documents for answering questions. Pass multiple IDs to retrieve them in one call.',
        inputSchema: {
            document_ids: z.array(z.number()).min(1)
                .describe('List of document IDs to fetch content for. Get IDs from search_documents first.'),
        },
    },
    async ({ document_ids }) => {
        const results = await Promise.allSettled(
            document_ids.map((id) => paperless.getDocumentById(id))
        );

        const documents = results.map((r, i) =>
            r.status === 'fulfilled'
                ? r.value
                : { id: document_ids[i], error: (r.reason as any)?.message ?? 'Failed to fetch' }
        );

        const output = { documents };

        return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
        };
    }
);

// Tool 3: search_tags
server.registerTool(
    'search_tags',
    {
        title: 'Search Tags',
        description:
            'Searches for tags by name. Use this when you need to confirm a tag exists or find its exact name before filtering documents with `search_documents`. Returns tag name, ID, and document count.',
        inputSchema: {
            query: z.string()
                .describe('Partial or full tag name to search for (case-insensitive).'),
        },
        outputSchema: {
            matchCount: z.number(),
            matchInfo: z.array(z.object({
                tagId: z.number(),
                name: z.string(),
                count: z.number(),
            })),
        },
    },
    async ({ query }) => {
        try {
            const data = await paperless.searchTags(query);
            const output = {
                matchCount: data.matchCount,
                matchInfo: data.info,
            };
            return {
                content: [{ type: 'text', text: JSON.stringify(output) }],
                structuredContent: output,
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text', text: `Error: ${error?.message ?? 'Error while searching tags.'}` }],
                structuredContent: { matchCount: 0, matchInfo: [] },
            };
        }
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`Server started`);
}

main().catch((error) => {
    console.error(`Error starting server`, error);
    process.exit(1);
});
