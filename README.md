# nodejs-sample-k8-app

Production-ready Node.js application deployed on AWS EKS via Helm, with a full observability stack baked into the chart.

| Layer | Tool |
|---|---|
| Application | Node.js + Express + `prom-client` |
| Container registry | Amazon ECR |
| Orchestration | Amazon EKS |
| Deployment | Helm 3 |
| Log collection | Fluent Bit (DaemonSet) |
| Log storage + search | Elasticsearch + Kibana |
| Metrics | Prometheus (kube-prometheus-stack) |
| Dashboards | Grafana (auto-provisioned) |
| CI/CD | Jenkins (Groovy declarative pipeline) |

---

## CI/CD Pipeline

```mermaid
graph LR
    A([Checkout\ngit pull]) --> B([Install\nnpm install])
    B --> C([Test\nnpm test])
    C --> D([Build\ndocker build])
    D --> E([Push\nECR push])
    E --> F([Deploy\nhelm upgrade \nEKS Deployment])

    style A fill:#f0f4ff,stroke:#4a6cf7,stroke-width:1.5px,color:#1a1a2e
    style B fill:#f0f4ff,stroke:#4a6cf7,stroke-width:1.5px,color:#1a1a2e
    style C fill:#f0f4ff,stroke:#4a6cf7,stroke-width:1.5px,color:#1a1a2e
    style D fill:#fff4e6,stroke:#e67e00,stroke-width:1.5px,color:#1a1a2e
    style E fill:#fff4e6,stroke:#e67e00,stroke-width:1.5px,color:#1a1a2e
    style F fill:#e6f7ee,stroke:#27ae60,stroke-width:2px,color:#1a1a2e
```

---

## Helm Chart Structure

```mermaid
graph TD
    Root["nodejs-sample-k8-app\charts"]

    Root --> Config["Chart config\nChart.yaml · values.yaml"]
    Root --> T["templates/"]
    Root --> Deps["Chart.yaml dependencies"]

    T --> App["App manifests\ndeployment.yaml\nservice.yaml · ingress.yaml"]
    T --> Logging["Log shipping\nfluentbit-config.yaml\nfluentbit-daemonset.yaml"]
    T --> Monitoring["Dashboards\ngrafana-dashboard.yaml\nNOTES.txt"]

    Deps --> ES["elastic/elasticsearch\nStatefulSet + PVC"]
    Deps --> KB["elastic/kibana\nWeb UI :5601"]
    Deps --> KPS["prometheus-community/\nkube-prometheus-stack\nPrometheus + Grafana"]

    App -. "port named api-web\nPrometheus annotations" .-> Logging
    Logging -. "ships logs to" .-> ES
    KPS -. "auto-provisions\ndashboard + datasource" .-> Monitoring

    style Root fill:#e8f0fe,stroke:#4a6cf7,stroke-width:2px,color:#1a1a2e
    style Config fill:#f8f9fa,stroke:#6c757d,stroke-width:1px,color:#1a1a2e
    style T fill:#f8f9fa,stroke:#6c757d,stroke-width:1px,color:#1a1a2e
    style Deps fill:#f8f9fa,stroke:#6c757d,stroke-width:1px,color:#1a1a2e
    style App fill:#e6f7ee,stroke:#27ae60,stroke-width:1.5px,color:#1a1a2e
    style Logging fill:#fff4e6,stroke:#e67e00,stroke-width:1.5px,color:#1a1a2e
    style Monitoring fill:#fdf0ff,stroke:#9b59b6,stroke-width:1.5px,color:#1a1a2e
    style ES fill:#fdf0ff,stroke:#9b59b6,stroke-width:1px,color:#1a1a2e
    style KB fill:#fdf0ff,stroke:#9b59b6,stroke-width:1px,color:#1a1a2e
    style KPS fill:#fdf0ff,stroke:#9b59b6,stroke-width:1px,color:#1a1a2e
```

---

## Observability Data Flow

```mermaid
graph TD
    subgraph pod["EKS Pod"]
        App["Node.js app"]
        Stdout["stdout\nJSON logs"]
        Metrics["/metrics\nprom-client"]
        App --> Stdout
        App --> Metrics
    end

    subgraph logging["Log pipeline"]
        FB["Fluent Bit DaemonSet\ntails /var/log/containers/*\nadds k8s metadata"]
        ESC["Elasticsearch\nindex: nodejs-logs-*"]
        Kibana["Kibana\nport-forward :5601"]
        FB -->|enriched logs| ESC
        ESC --> Kibana
    end

    subgraph metrics["Metrics pipeline"]
        Prom["Prometheus\nscrapes via pod annotations"]
        Grafana["Grafana\nport-forward :3000"]
        Prom --> Grafana
    end

    Stdout -->|captured by node volumes| FB
    Metrics -->|scraped on port 3000| Prom
    ESC -. "Elasticsearch\ndata source" .-> Grafana

    style pod fill:#e6f7ee,stroke:#27ae60,stroke-width:1.5px,color:#1a1a2e
    style logging fill:#fff4e6,stroke:#e67e00,stroke-width:1.5px,color:#1a1a2e
    style metrics fill:#e8f0fe,stroke:#4a6cf7,stroke-width:1.5px,color:#1a1a2e
    style App fill:#c8f0d8,stroke:#27ae60,stroke-width:1px,color:#1a1a2e
    style Stdout fill:#c8f0d8,stroke:#27ae60,stroke-width:1px,color:#1a1a2e
    style Metrics fill:#c8f0d8,stroke:#27ae60,stroke-width:1px,color:#1a1a2e
    style FB fill:#ffe5b4,stroke:#e67e00,stroke-width:1px,color:#1a1a2e
    style ESC fill:#ffe5b4,stroke:#e67e00,stroke-width:1px,color:#1a1a2e
    style Kibana fill:#ffe5b4,stroke:#e67e00,stroke-width:1px,color:#1a1a2e
    style Prom fill:#c5d8fd,stroke:#4a6cf7,stroke-width:1px,color:#1a1a2e
    style Grafana fill:#c5d8fd,stroke:#4a6cf7,stroke-width:1px,color:#1a1a2e
```

> Grafana has two data sources out of the box: Prometheus for metrics and Elasticsearch for logs. No manual setup needed after `helm upgrade --install`.

---

## Directory Structure

```
nodejs-docker-example/
├── charts/
│       ├── Chart.yaml                      # App + ELK + Grafana dependencies
│       ├── values.yaml                     # All configuration
│       └── templates/
│           ├── deployment.yaml             # api-web named port, Prometheus annotations
│           ├── service.yaml                # targetPort: api-web
│           ├── ingress.yaml                # AWS ALB
│           ├── fluentbit-config.yaml       # Log pipeline: tail → K8s filter → ES
│           ├── fluentbit-daemonset.yaml    # DaemonSet + RBAC
│           ├── grafana-dashboard.yaml      # Pre-built Node.js dashboard ConfigMap
│           └── NOTES.txt
├── Dockerfile                              # Multi-stage, non-root
├── index.js                                # Express app + /metrics endpoint
├── package.json
├── test.js                                 # Smoke test (used by Jenkins)
└── Jenkinsfile                             # Full CI/CD pipeline
```

---

## Quick Start (local)

```bash
npm install
npm start
# App     → http://localhost:3000
```

---

## AWS Pre-requisites

1. **ECR repository** – create it once:
   ```bash
   aws ecr create-repository --repository-name nodejs-sample-k8-app --region us-east-1
   ```

2. **EKS cluster** – with the [AWS Load Balancer Controller](https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html) installed (required for Ingress/ALB).

3. **Jenkins credentials** – add your AWS IAM key pair under the ID `aws-credentials-id`.

4. **Update `values.yaml`** – replace the placeholder ECR URL:
   ```yaml
   image:
     repository: <AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/nodejs-sample-k8-app
   ```

5. **Update `Jenkinsfile`** – set `AWS_REGION`, `AWS_ACCOUNT_ID`, `EKS_CLUSTER_NAME`.

---

## Manual Helm Deployment

```bash
# Add repos
helm repo add elastic              https://helm.elastic.co
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Pull sub-chart tarballs
helm dependency build ./charts/nodejs-sample-k8-app

# Lint
helm lint ./charts/nodejs-sample-k8-app

# Deploy
helm upgrade --install my-nodejs-app ./charts/nodejs-sample-k8-app \
  --namespace default \
  --create-namespace \
  --set image.repository=<ECR_URI> \
  --set image.tag=<BUILD_NUMBER> \
  --atomic --wait
```

---

## Observability

### Accessing the UIs

```bash
# Kibana (index pattern: nodejs-logs-*)
kubectl port-forward svc/my-nodejs-app-kibana 5601:5601

# Grafana (admin / changeme-in-production)
kubectl port-forward svc/my-nodejs-app-kube-prometheus-stack-grafana 3000:80
```

Kibana index pattern: `nodejs-logs-*` | Time field: `@timestamp`

---

## Key Design Decisions

- **Named port `api-web`** — the container port in `deployment.yaml` is named `api-web`; `service.yaml` references it via `targetPort: api-web` so service routing isn't coupled to a hardcoded port number.
- **Fluent Bit as DaemonSet** — runs on every EKS worker node so there's no per-pod sidecar overhead. Logs are captured at the host level from `/var/log/containers/*`.
- **Grafana auto-provisioning** — both the Elasticsearch data source and the Node.js metrics dashboard are declared in `values.yaml`, so the Grafana UI is ready to use immediately after deploy with no manual configuration.
- **`--atomic` flag** — if any resource in the Helm release fails to reach a ready state, Helm automatically rolls back to the previous release, keeping the cluster in a known-good state.
- **Multi-stage Dockerfile** — the build stage installs dependencies; the runtime stage copies only the production artifacts and runs as a non-root user, keeping the image lean and reducing attack surface.
