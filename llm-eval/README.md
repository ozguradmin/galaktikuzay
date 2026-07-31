# Open-source multilingual LLM evaluation toolkit

`llm-eval` is a standalone TypeScript command-line toolkit for comparing two
OpenAI-compatible language-model endpoints on the same JSONL dataset. It measures
structured-output quality, source URL adherence, basic language consistency,
latency, token usage, estimated cost, and request reliability.

The toolkit was developed to make provider and open-model experiments
repeatable without coupling them to a production publishing system. Galaktik
Uzay currently runs a live production pipeline that uses Azure OpenAI. This
directory is an independent evaluation tool for comparing open models and
inference providers; it does **not** mean that an open model has been deployed
to production or that Inference.net is currently used by Galaktik Uzay.

It has no code path that writes to WordPress, Cloudflare D1, Galaktik Uzay
Workers, or any production database or endpoint.

## Supported tasks

- `story-selection`: choose a story from synthetic news candidates.
- `article-generation`: produce source-grounded Turkish structured articles.
- `translation`: translate Turkish input into English, German, Spanish, French,
  or Dutch.
- Compare a `baseline` and a `candidate` endpoint, or run either one alone.

## Requirements and installation

- Node.js 20 or newer
- npm

```bash
cd llm-eval
npm ci
cp .env.example .env
```

The `.env` file is ignored by Git. Replace placeholders only in your local
environment and never commit API keys.

## Provider configuration

```dotenv
BASELINE_BASE_URL=https://api.example.com/v1
BASELINE_API_KEY=local-secret
BASELINE_MODEL=baseline-model

CANDIDATE_BASE_URL=https://api.example.com/v1
CANDIDATE_API_KEY=local-secret
CANDIDATE_MODEL=candidate-model
```

By default, `/chat/completions` is appended to each base URL and the key is sent
as `Authorization: Bearer ...`. A URL that already ends in `/chat/completions`
is used unchanged. Azure-style and other compatible deployments can select a
different key header and add non-secret headers or query parameters:

```dotenv
BASELINE_BASE_URL=https://example.openai.azure.com/openai/deployments/my-deployment/chat/completions
BASELINE_API_KEY_HEADER=api-key
BASELINE_QUERY_JSON={"api-version":"2024-10-21"}
BASELINE_HEADERS_JSON={}
```

The candidate provider has matching `CANDIDATE_API_KEY_HEADER`,
`CANDIDATE_QUERY_JSON`, and `CANDIDATE_HEADERS_JSON` variables. Keep secrets in
the dedicated API key variables, not in the JSON examples. Missing URL, key, or
model configuration produces a clear error before any live request is made.

Optional USD prices per one million tokens enable cost estimates:

```dotenv
BASELINE_INPUT_COST_PER_MILLION=1.00
BASELINE_OUTPUT_COST_PER_MILLION=2.00
CANDIDATE_INPUT_COST_PER_MILLION=0.25
CANDIDATE_OUTPUT_COST_PER_MILLION=0.50
```

If pricing or token usage is unavailable, reports show `not configured` rather
than manufacturing a cost. `REQUEST_TIMEOUT_MS` and `MAX_RETRIES` control request
reliability behavior.

## Usage

Compare both providers:

```bash
npm run eval -- \
  --dataset data/sample-article-generation.jsonl \
  --task article-generation \
  --output output/run-001
```

Useful options:

```text
--baseline-only
--candidate-only
--limit <number>
--concurrency <number>
--temperature <number>
--output <directory>
--mock
```

`--baseline-only` and `--candidate-only` are mutually exclusive. The default
concurrency is 2 and the default temperature is 0.

### Mock mode

Mock mode makes no network calls and needs no provider credentials. It returns
deterministic local fixture output, so it is suitable for CI and smoke tests:

```bash
npm run eval -- \
  --dataset data/sample-article-generation.jsonl \
  --task article-generation \
  --output output/example \
  --mock
```

## Dataset format

Datasets are newline-delimited JSON. All included examples are small,
synthetic, fictional, and free of production or personal data.

```json
{
  "id": "article-001",
  "task": "article-generation",
  "input": {
    "language": "tr",
    "sources": [
      {
        "url": "https://example.com/synthetic-source",
        "title": "Synthetic astronomy source",
        "content": "Synthetic and clearly fictional test content."
      }
    ]
  },
  "expected": {
    "requiredFields": ["title", "summary", "content", "sources"],
    "allowedSourceUrls": ["https://example.com/synthetic-source"]
  }
}
```

The repository includes separate story-selection, article-generation, and
translation datasets under `data/`.

## Metrics and limitations

- **JSON validity:** parses the full response as JSON.
- **Schema compliance:** validates article output with JSON Schema.
- **Required fields:** checks task-specific required top-level fields.
- **Source adherence:** extracts output URLs and checks them against the input
  allowlist. This is a heuristic URL-containment check, **not fact-checking**. It
  cannot establish that prose claims are supported by a source.
- **Language consistency:** looks for a small set of common language markers.
  It is intentionally lightweight and can misclassify short, multilingual, or
  proper-noun-heavy text. It is not a substitute for human linguistic review.
- **Performance:** records end-to-end request latency and provider-reported
  input, output, and total token counts. First-token latency is reported as
  unavailable because the current portable client uses non-streaming responses.
- **Estimated cost:** applies user-supplied prices to provider-reported token
  counts. It does not claim to be a billing statement.
- **Reliability:** reports successes, errors, timeouts, retries, JSON validity,
  and schema success rates for each provider.

Automated metrics are useful screening signals. Editorial quality, factual
accuracy, safety, and translation fidelity still require expert review.

## Reports

Every run writes:

- `results.json`: run metadata, raw output, per-sample metrics, and errors.
- `results.csv`: flat per-sample comparison data.
- `summary.md`: provider models, dataset, sample count, success and error rates,
  average and p95 latency, JSON/schema rates, estimated cost, and failed samples.

Example summary row:

| Provider | Model | Success | Avg latency | JSON valid | Estimated cost |
| --- | --- | ---: | ---: | ---: | ---: |
| candidate | example-model | 100.0% | 842.50 ms | 100.0% | not configured |

Generated `output/` runs are ignored by Git except for `.gitkeep`.

## Development

```bash
npm run typecheck
npm test
npm run build
```

Contributions should include focused tests, use only synthetic fixtures, and
preserve provider neutrality. Please document new metrics and their limitations.

## Security

- Never commit provider keys, tokens, private endpoints, request headers, or
  real user/production data.
- Reports contain model output and error messages, but never serialize provider
  configuration or headers. The configured API key is redacted if an exception
  unexpectedly includes it.
- Review datasets before use: prompts and model outputs may contain sensitive
  material even when the toolkit itself stores no credentials.
- Mock mode is the default choice for CI and untrusted environments.

## License scope

The MIT license in this directory applies only to the llm-eval toolkit. It does not automatically license other parts of the parent repository.

See [`LICENSE`](LICENSE) for the full terms.
