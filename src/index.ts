import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { z } from "zod";
import 'dotenv/config';

class PaperlessClient {
    private baseUrl: string;
    private apiKey: string;

    constructor(baseUrl: string, apiKey: string) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }

    async getDocuments(
        query: string,
        tags?: string[],
        ordering?: string,
        id?: number,
        created?: string,
        added_after?: string,
        added_before?: string
    ): Promise<any> {
        const params = new URLSearchParams({
            query: query,
        });

        let apiUrl = `${this.baseUrl}/api/documents/?query=${query}`

        if (tags) {
            apiUrl.concat('tags__id__in', tags.join(','));
        }
        if (created) {
            apiUrl += `&created__gte${created}`
        }
        if (added_after) {
            apiUrl += `&added__gte${added_after}`;
        }
        if (added_before) {
            apiUrl += `&added__lte${added_before}`;
        }
        if (ordering) {
            apiUrl += `&ordering${ordering}`;
        }

        const response = await axios.get(

            apiUrl,
            {
                params,
                headers: {
                    'Authorization': `Token ${this.apiKey}`
                }
            }
        );

        if (response.data.count < 1) {
            console.error(`No Documents were found`);
        }
        else {
            return response.data;
        }
    }

    /*
    async getDocumentContent(query: string): Promise<any> {
        const response= await axios.get(
            `${this.baseUrl}/api/documents/?query=${query}/`,
            {
                headers: {
                    'Authorization': `Token ${this.apiKey}`
                }
            }
        );

        if (response.data.includes('__search_hit__') && response.data.score > 0.3) {
            return response.data.content;
        }
        else {
            console.error(`No Content`);
        }

        //return response.data.content || console.error("No Content");
    }

    async getDocumentMetadata(id: number): Promise<any> {
        const response = await axios.get(
            `${this.baseUrl}/api/documents/${id}`,
            {
                headers: {
                    'Authorization': `Token ${this.apiKey}`
                }
            }
        );

        return {
            id: response.data.id,
            title: response.data.title,
            created: response.data.created,
            tags: response.data.tags,
        }

    }
    */

}

// Init servers
const server = new McpServer({
    name: 'Paperless-ngx-MCP-Server',
    version: '1.0.0'
});

const paperless = new PaperlessClient(
    process.env.PAPERLESS_URL || 'http://localhost:8000',
    process.env.PAPERLESS_API_KEY || ''
);

// Tools
server.registerTool(
    'get_document',
    {
        title: "Get Documents",
        description: "Search for documents in paperless-ngx",
        inputSchema: {
            query: z.string(),
            tags: z.array(z.string()).optional(),
            ordering: z.string().optional(),
            id: z.number().optional(),
            created:z.string().optional(),
            added_after: z.string().optional(),
            added_before: z.string().optional()
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
);

/*
server.registerTool(
    'search_document_content',
    {
        title: "Search Document Content",
        description: "Search for contents of document in paperless-ngx",
        inputSchema: { query: z.string(), id: z.number() },
    },
    async ({query}) => {
        const output = await paperless.getDocumentContent(query);
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
);
*/

/*
server.registerTool(
    'search_document_metadata',
    {
        title: "Search Document Metadata",
        description: "Search for metadata of document in paperless-ngx",
        inputSchema: { id: z.number() },
        outputSchema: {
            id: z.number(),
            title: z.string(),
            created: z.string(),
            tags: z.array(z.string())
        }
    },
    async ({id}) => {
        const output = await paperless.getDocumentMetadata(id);
        return {
            content: [
                {
                    type: 'text',
                    object: JSON.stringify(output),
                }
            ],
            structuredContent: output
        };
    }
);
*/

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`Server started`);
}

main().catch((error) => {
    console.error(`Error starting server`, error);
    process.exit(1);
});