# nodejs-sample-k8-app

Production-ready Node.js application deployed on **AWS EKS** via **Helm**, with full observability:

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

## Directory Structure

```
nodejs-docker-example/
├── charts/
│   └── nodejs-sample-k8-app/
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
# App → http://localhost:3000
# Metrics → http://localhost:3000/metrics
# Health → http://localhost:3000/health
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
# 1. Add Helm repos
helm repo add elastic              https://helm.elastic.co
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# 2. Download sub-chart tarballs
helm dependency build ./charts/nodejs-sample-k8-app

# 3. Lint
helm lint ./charts/nodejs-sample-k8-app

# 4. Deploy
helm upgrade --install my-nodejs-app ./charts/nodejs-sample-k8-app \
  --namespace default \
  --create-namespace \
  --set image.repository=<ECR_URI> \
  --set image.tag=<BUILD_NUMBER> \
  --atomic --wait
```

---

## Observability

### Logs → ELK

```
Node.js stdout (JSON)
    │
    ▼  (tailed by)
Fluent Bit DaemonSet
    │  enriches with k8s metadata
    ▼
Elasticsearch  (index: nodejs-logs-YYYY.MM.DD)
    │
    ▼
Kibana  →  port-forward 5601
```

**Kibana index pattern:** `nodejs-logs-*`  |  **Time field:** `@timestamp`

### Metrics → Grafana

```
Node.js /metrics  (prom-client)
    │
    ▼  (scraped by)
Prometheus  (via pod annotations in deployment.yaml)
    │
    ▼
Grafana dashboard  →  port-forward 3000
```

### Port-forward shortcuts

```bash
# Kibana
kubectl port-forward svc/my-nodejs-app-kibana 5601:5601

# Grafana  (admin / changeme-in-production)
kubectl port-forward svc/my-nodejs-app-kube-prometheus-stack-grafana 3000:80
```

---

## Key Design Decisions

- **Named port `api-web`**: The container port in `deployment.yaml` is named `api-web`; `service.yaml` references it via `targetPort: api-web` for loose coupling.
- **Fluent Bit as DaemonSet**: Runs on every EKS worker node; no sidecar overhead per pod.
- **Grafana auto-provisioning**: Elasticsearch data source and the Node.js dashboard are pre-configured in `values.yaml` — zero manual UI clicks.
- **`--atomic` Helm flag**: Automatically rolls back on failure, keeping the cluster in a known-good state.
- **Multi-stage Dockerfile**: Separates build and runtime, runs as a non-root user.
