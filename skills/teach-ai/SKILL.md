---
name: teach-ai
description: Teach machine learning, neural networks and language models through small fully worked examples.
metadata:
  roles: [planner]
  category: subject
  tags: [machine learning, supervised learning, unsupervised learning, neural network, neural networks, deep learning, gradient descent, backpropagation, artificial intelligence, generative ai, llm, large language model, transformer, tokenization, embeddings, rag, tool calling, ai agent, model evaluation]
  scenes: [DatasetScene, ModelTrainingScene, NeuralNetworkScene, ModelEvaluationScene, MLScatterScene, TreeScene, TokenizationScene, TextGenerationScene, AttentionScene, RAGScene, AIWorkflowScene]
---

Choose one learner-friendly example and match speech to the exact value, token, connection, or evidence on screen. On a continuing board keep the earlier material visible and cue only the next change.

For supervised learning, show inputs and known answers before naming features and labels. DatasetScene reveals example rows, then distinguishes fitting on training data, tuning with validation data and measuring held-out performance with test data. Cue a separate data-leakage warning when teaching leakage.

ModelTrainingScene works through a linear prediction with one adjustable weight and a fixed bias. It computes mean squared error and gradient updates, so narrate the actual initial weight, example and learning rate. Use gradient mode for the loss curve. Keep inputs scaled. NeuralNetworkScene shows hidden ReLU layers, a linear output, and the calculation for a selected neuron. A backward step traces a selected gradient of squared error when a target is supplied. An update changes one weight and recomputes the output. Start with two inputs and a small hidden layer.

Use ModelEvaluationScene for a confusion matrix, using actual and predicted classes in the correct positions. Use optional training and test scores when comparing underfit and overfit. MLScatterScene classifies a new point with an explicit threshold, computes k-means assignments and shifts the centers, or ranks illustrative 2D vectors by cosine similarity. For a decision tree, give TreeScene a static nested tree and cue each decisionPath entry from the root to a leaf. Explain the condition that selects each child.

Use TokenizationScene to keep the sentence on screen and draw the link from each text piece to its ID. Preserve spaces. Identify the source tokenizer or label the example illustrative. TextGenerationScene shows a distribution and the choice that is appended to the same text at each step. Label toy probabilities and explain whether the choice was supplied or illustrates sampling. AttentionScene computes a small causal example, draws the weighted links to the query, masks future tokens, and reveals the transformer blocks in sequence. Describe the block layout as one design and the scalar head as a demonstration.

AIWorkflowScene uses lifecycle for pretraining, fine-tuning and inference. Use RAGScene for a continuous query-to-answer walkthrough. Cue the exact query pieces, then show the whole-query vector, rank illustrative passage vectors by cosine similarity, and reveal the retrieved passage alongside the cited answer. Use tools to show the selected tool, returned result and how the result is used. Use reliability to compare supported, unsupported and uncertain answers. Keep supplied passages and results visible and clearly mark illustrative examples.
