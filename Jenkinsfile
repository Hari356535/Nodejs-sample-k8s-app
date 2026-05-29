// ══════════════════════════════════════════════════════════════════════════════
//  Jenkins Declarative Pipeline
//  nodejs-sample-k8-app  →  ECR  →  EKS (Helm)
//
//  Prerequisites on the Jenkins agent:
//    • Docker CLI
//    • AWS CLI v2
//    • kubectl
//    • Helm v3
//    • Node.js + npm  (for running tests)
//
//  Jenkins credentials required:
//    • aws-credentials-id  (AWS access key + secret, type: Amazon Web Services)
// ══════════════════════════════════════════════════════════════════════════════

pipeline {
    agent any

    environment {
        // ── AWS / ECR / EKS ──────────────────────────────────────────────────
        AWS_REGION        = 'us-east-1'            // ← change to your region
        AWS_ACCOUNT_ID    = '123456789012'          // ← change to your account ID
        ECR_REPOSITORY    = 'nodejs-sample-k8-app'
        EKS_CLUSTER_NAME  = 'production-eks-cluster'

        // ── Helm ─────────────────────────────────────────────────────────────
        HELM_RELEASE_NAME = 'my-nodejs-app'
        HELM_CHART_PATH   = './charts/nodejs-sample-k8-app'
        HELM_NAMESPACE    = 'default'

        // ── Derived values ───────────────────────────────────────────────────
        IMAGE_TAG         = "${BUILD_NUMBER}"
        ECR_REGISTRY      = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
        IMAGE_FULL        = "${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
        IMAGE_LATEST      = "${ECR_REGISTRY}/${ECR_REPOSITORY}:latest"
    }

    options {
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        // ── 1. Checkout ───────────────────────────────────────────────────────
        stage('Checkout Codebase') {
            steps {
                checkout scm
                echo "✅ Checked out branch: ${env.GIT_BRANCH} @ ${env.GIT_COMMIT?.take(8)}"
            }
        }

        // ── 2. Unit Tests ─────────────────────────────────────────────────────
        stage('Run Unit Tests') {
            steps {
                sh 'npm ci'
                sh 'npm test'
            }
            post {
                failure {
                    echo '❌ Unit tests failed. Stopping pipeline.'
                }
            }
        }

        // ── 3. AWS Authentication ─────────────────────────────────────────────
        stage('AWS Authentication') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-credentials-id',
                    accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                    secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                ]]) {
                    // Authenticate Docker with ECR
                    sh """
                        aws ecr get-login-password --region ${AWS_REGION} \
                          | docker login --username AWS --password-stdin ${ECR_REGISTRY}
                    """

                    // Configure kubectl for the EKS cluster
                    sh """
                        aws eks update-kubeconfig \
                          --region ${AWS_REGION} \
                          --name ${EKS_CLUSTER_NAME}
                    """

                    // Verify connectivity
                    sh 'kubectl cluster-info --request-timeout=10s'
                }
            }
        }

        // ── 4. Build Docker Image ─────────────────────────────────────────────
        stage('Build Docker Image') {
            steps {
                script {
                    sh "docker build -t ${IMAGE_FULL} ."
                    sh "docker tag ${IMAGE_FULL} ${IMAGE_LATEST}"
                    echo "✅ Built: ${IMAGE_FULL}"
                }
            }
        }

        // ── 5. Push to ECR ────────────────────────────────────────────────────
        stage('Push Image to ECR') {
            steps {
                script {
                    sh "docker push ${IMAGE_FULL}"
                    sh "docker push ${IMAGE_LATEST}"
                    echo "✅ Pushed to ECR: ${IMAGE_FULL}"
                }
            }
        }

        // ── 6. Helm Dependencies ──────────────────────────────────────────────
        stage('Setup Helm Dependencies') {
            steps {
                script {
                    // Add community Helm repos
                    sh 'helm repo add elastic            https://helm.elastic.co'
                    sh 'helm repo add prometheus-community https://prometheus-community.github.io/helm-charts'
                    sh 'helm repo update'

                    // Download + lock sub-chart tarballs into charts/
                    sh "helm dependency build ${HELM_CHART_PATH}"

                    echo "✅ Helm dependencies ready"
                }
            }
        }

        // ── 7. Helm Lint ──────────────────────────────────────────────────────
        stage('Helm Lint') {
            steps {
                sh "helm lint ${HELM_CHART_PATH} --set image.tag=${IMAGE_TAG}"
            }
        }

        // ── 8. Deploy to EKS ──────────────────────────────────────────────────
        stage('Deploy to EKS') {
            steps {
                script {
                    sh """
                        helm upgrade --install ${HELM_RELEASE_NAME} ${HELM_CHART_PATH} \
                          --namespace   ${HELM_NAMESPACE}            \
                          --create-namespace                         \
                          --set image.repository=${ECR_REGISTRY}/${ECR_REPOSITORY} \
                          --set image.tag=${IMAGE_TAG}               \
                          --atomic                                   \
                          --timeout 5m                               \
                          --wait
                    """
                    echo "✅ Helm release '${HELM_RELEASE_NAME}' deployed successfully"
                }
            }
        }

        // ── 9. Smoke Test ─────────────────────────────────────────────────────
        stage('Smoke Test') {
            steps {
                script {
                    // Wait for the deployment rollout to complete
                    sh """
                        kubectl rollout status deployment/${HELM_RELEASE_NAME} \
                          -n ${HELM_NAMESPACE} \
                          --timeout=120s
                    """
                    echo "✅ Rollout healthy"
                }
            }
        }
    }

    // ── Post Actions ──────────────────────────────────────────────────────────
    post {
        always {
            // Remove local Docker images to free agent disk space
            sh "docker rmi ${IMAGE_FULL}   || true"
            sh "docker rmi ${IMAGE_LATEST} || true"
        }
        success {
            echo """
╔══════════════════════════════════════════════╗
║  ✅  Pipeline completed successfully!        ║
║  Release : ${HELM_RELEASE_NAME}
║  Image   : ${IMAGE_FULL}
╚══════════════════════════════════════════════╝
            """
        }
        failure {
            echo """
╔══════════════════════════════════════════════╗
║  ❌  Pipeline FAILED – check stage logs      ║
╚══════════════════════════════════════════════╝
            """
            // Optional: add Slack / email notification here
            // slackSend channel: '#deployments', message: "Build ${BUILD_NUMBER} FAILED"
        }
    }
}
