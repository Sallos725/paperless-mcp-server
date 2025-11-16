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

    buildUrl(
        query?: string,
        tags?: number[],
        ordering?: string,
        id?: number,
        created?: string,
        added_after?: string,
        added_before?: string
    ) {
        let url = `${this.baseUrl}/api/documents/`;
        if (query) {
            url += `?query=${query}`;
        }
        /*
        if (tags && tags.length > 0) {
            url += (url.includes('?') ? '&' : '?') + `tags__id__in=${tags.join(',')}`;
        }
        if (created) {
            url += (url.includes('?') ? '&' : '?') + `created__gte=${created}`
        }
        */
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

    private async fetchDocuments(apiUrl: string): Promise<any> {
        try {
            const response = await axios.get(
                apiUrl, {
                    headers: {
                        'Authorization': `Token ${this.apiKey}`
                    }
                }
            );

            return response.data;
        }
        catch (e) {
            if (axios.isAxiosError(e) && e.response?.status === 401) {
                throw new Error(`Unauthorized: Please check your API key`);
            }
            console.error(`Error fetching documents: `, e);
            throw e;
        }
    }

    async getDocuments(
        query?: string,
        tags?: number[],
        ordering?: string,
        id?: number,
        created?: string,
        added_after?: string,
        added_before?: string
    ): Promise<any> {
        const apiUrl = this.buildUrl(
            query,
            tags,
            ordering,
            id,
            created,
            added_after,
            added_before
        );

        return this.fetchDocuments(apiUrl);
    }

    async getInfoFromTags(query: string): Promise<tagInfo[]> {
        let url = `${this.baseUrl}/api/tags/?name__icontains=${query}`;
        try {
            const response = await axios.get(
                url, {
                    headers: {
                        'Authorization': `Token ${this.apiKey}`
                    }
                }
            );

            const result = response.data.results ?? [];

            return result.map((t: any) => ({
                id: t.id,
                name: t.name,
                count: t.document_count
            }));
        }
        catch (e) {
            console.error(`Error with tag search: ${e}`)
            throw(e)
        }
    }
}

// types for tag search
type tagInfo = {
    id: number;
    name: string;
    count: number;
};

type lightDocument = {
    title: string,
    id?: number,
    created?: string,
    added?: string,
    tags?: number[]
}

type DocumentTitle = string;

// Init servers
const server = new McpServer({
    name: 'Paperless-ngx-MCP-Server',
    version: '1.0.0'
});

const paperlessUrl = process.env.PAPERLESS_URL || 'http://localhost:8000';
const paperlessApiKey = process.env.PAPERLESS_API_KEY;
if (!paperlessApiKey || paperlessApiKey.trim() === '') {
    throw new Error('Missing Paperless-ngx API Key');
}

const paperless = new PaperlessClient(
    paperlessUrl,
    paperlessApiKey
);

function projectToLightDocuments(raw: any): lightDocument[] {
    const docs = Array.isArray(raw?.results)
        ? raw.results
        : Array.isArray(raw)
            ? raw
            : raw
                ? [raw]
                : [];

    return docs.map((doc: any) => ({
        id: doc.id,
        title: doc.title,
        created: doc.created,
        added: doc.added,
        tags: doc.tags,
    }));
}

function projectToTitles(raw: any): DocumentTitle[] {
    const docs = projectToLightDocuments(raw);
    return docs
        .filter((d) => !!d.title)
        .map((d) => d.title as string);
}

// Tools

// 1. Titles only (very light payload for LLM)
server.registerTool(
    'get_document_title',
    {
        title: "Get document titles",
        description: "Search for documents in Paperless-ngx and return only their IDs and titles to minimize LLM context size.",
        inputSchema: {
            query: z.string().optional(),
            tags: z.array(z.number()).optional(),
            ordering: z.string().optional(),
            id: z.number().optional(),
            created: z.string().optional(),
            added_after: z.string().optional(),
            added_before: z.string().optional(),
        },
    },
    async ({
               query,
               tags,
               ordering,
               id,
               created,
               added_after,
               added_before,
           }) => {
        try {
            const output = await paperless.getDocuments(
                query,
                tags,
                ordering,
                id,
                created,
                added_after,
                added_before,
            );

            const titles = projectToTitles(output);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(titles, null, 2),
                    }
                ],
                structuredContent: { titles },
            };
        } catch (error: any) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: ${error?.message ?? 'Error while fetching document titles.'}`,
                    }
                ]
            };
        }
    }
);

// 2. Metadata only (lightDocument projection)
server.registerTool(
    'get_document_meta',
    {
        title: "Get document metadata",
        description: "Search for documents in Paperless-ngx and return light metadata (id, title, created, added, tags) to keep LLM context small.",
        inputSchema: {
            query: z.string().optional(),
            tags: z.array(z.number()).optional(),
            ordering: z.string().optional(),
            id: z.number().optional(),
            created: z.string().optional(),
            added_after: z.string().optional(),
            added_before: z.string().optional(),
        },
    },
    async ({
               query,
               tags,
               ordering,
               id,
               created,
               added_after,
               added_before,
           }) => {
        try {
            const output = await paperless.getDocuments(
                query,
                tags,
                ordering,
                id,
                created,
                added_after,
                added_before,
            );

            const meta = projectToLightDocuments(output);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(meta, null, 2),
                    }
                ],
                structuredContent: { documents: meta },
            };
        } catch (error: any) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: ${error?.message ?? 'Error while fetching document metadata.'}`,
                    }
                ]
            };
        }
    }
);

// 3. Full Document
server.registerTool(
    'get_document',
    {
        title: "Get documents with full content",
        description: "Search for documents in Paperless-ngx and return the full raw JSON response (use sparingly; this can be large).",
        inputSchema: {
            query: z.string().optional(),
            tags: z.array(z.number()).optional(),
            ordering: z.string().optional(),
            id: z.number().optional(),
            created: z.string().optional(),
            added_after: z.string().optional(),
            added_before: z.string().optional(),
        },
    },
    async ({
               query,
               tags,
               ordering,
               id,
               created,
               added_after,
               added_before,
           }) => {
        try {
            const output = await paperless.getDocuments(
                query,
                tags,
                ordering,
                id,
                created,
                added_after,
                added_before,
            );
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(output, null, 2),
                    }
                ],
                structuredContent: output
            };
        }
        catch (error: any) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: ${error?.message ?? 'Error while fetching documents.'}`
                    }
                ]
            };
        }
    }
);

// 4. Tag search
server.registerTool(
    'get_info_from_tags',
    {
        title: 'Get Information from Tag search',
        description: 'Search for tags, and if exists, return information about them.',
        inputSchema: {
            query: z.string()
        },
    },
    async ({ query }) => {
        try {
            const output = await paperless.getInfoFromTags(query)
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(output, null, 2),
                    }
                ],
                structuredContent: output
            };
        }
        catch (error: any) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error ${error?.message ?? 'Error while looking for tags'}`
                    }
                ],
                structuredContent: error
            }
        }
    }
)

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`Server started`);
}

main().catch((error) => {
    console.error(`Error starting server`, error);
    process.exit(1);
});