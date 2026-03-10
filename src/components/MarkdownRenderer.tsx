import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Mermaid } from './Mermaid';
import { MathGraph } from './MathGraph';
import 'katex/dist/katex.min.css';

const preprocessMarkdown = (text: string) => {
  if (!text) return '';
  // Convert <math-graph> tags to markdown code blocks
  let processed = text.replace(/<math-graph>([\s\S]*?)<\/math-graph>/g, '```math-graph\n$1\n```');
  
  // Fix cases where AI writes \nmermaid\n without backticks
  processed = processed.replace(/(?:^|\n)mermaid\n([\s\S]*?)(?=\n\n|$)/g, '\n```mermaid\n$1\n```\n');
  
  return processed;
};

const markdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    
    if (!inline && match && match[1] === 'mermaid') {
      return <Mermaid chart={String(children).replace(/\n$/, '')} />;
    }
    
    if (!inline && match && (match[1] === 'math-graph' || match[1] === 'graph')) {
      return <MathGraph funcStr={String(children).replace(/\n$/, '')} />;
    }
    
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }
};

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <ReactMarkdown 
      remarkPlugins={[remarkMath]} 
      rehypePlugins={[rehypeKatex]} 
      components={markdownComponents}
    >
      {preprocessMarkdown(content)}
    </ReactMarkdown>
  );
};
