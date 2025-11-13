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
        */
        if (created) {
            url += (url.includes('?') ? '&' : '?') + `created__gte=${created}`
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

    async getDocuments(
        query?: string,
        tags?: number[],
        ordering?: string,
        id?: number,
        created?: string,
        added_after?: string,
        added_before?: string
    ): Promise<any> {
        try {
            const apiUrl = this.buildUrl(
                query,
                tags,
                ordering,
                id,
                created,
                added_after,
                added_before
            )

            const response = await axios.get(
                apiUrl,
                {
                    headers: {
                        'Authorization': `Token ${this.apiKey}`
                    }
                }
            );

            return response.data;
        }
        catch (e) {
            if (axios.isAxiosError(e) && e.response?.status == 401) {
                throw new Error(`Unauthorized: Please check your API key`);
            }
            console.error(`Error in getDocuments: `, e)
            throw e;
        }
    }
}

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

// Tools
server.registerTool(
    'get_document',
    {
        title: "Get Documents",
        description: "Search for documents in paperless-ngx",
        inputSchema: {
            query: z.string().optional(),
            tags: z.array(z.number()).optional(),
            ordering: z.string().optional(),
            id: z.number().optional(),
            created:z.string().date().optional(),
            added_after: z.string().date().optional(),
            added_before: z.string().date().optional()
        },
    },
    async ({
               query,
               tags,
               ordering,
               id,
               created,
               added_after,
               added_before
    }) => {
        try {
            const output = await paperless.getDocuments(
                query,
                tags,
                ordering,
                id,
                created,
                added_after,
                added_before
            );
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(output),
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
                        text: `Error: ${error.message ?? 'Error while fetching documents.'}`
                    }
                ]
            }
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