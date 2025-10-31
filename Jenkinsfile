pipeline {
    agent any

    stages {
        stage('Build') {
            steps {
                script {
                    // Detect OS
                    def isWindows = isUnix() == false

                    // Example build step that runs differently on Windows/Linux
                    if (isWindows) {
                        echo "Running on Windows"
                        bat 'build.bat'
                    } else {
                        echo "Running on Linux/Unix"
                        sh './build.sh'
                    }
                }
            }
        }

        stage('Test') {
            steps {
                script {
                    if (isUnix()) {
                        sh 'echo "Running tests on Linux"'
                    } else {
                        bat 'echo Running tests on Windows'
                    }
                }
            }
        }
    }
}
