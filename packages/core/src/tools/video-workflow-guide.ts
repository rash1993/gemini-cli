/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';

/**
 * Parameters for the VideoWorkflowGuideTool
 */
export interface VideoWorkflowGuideParams {
  stage: 'initial_setup' | 'planning' | 'slide_creation' | 'audio_generation' | 'synchronization' | 'assembly';
  context?: {
    projectPath?: string;
    currentState?: any;
    userChoice?: string;
  };
}

/**
 * Structure for stage-specific instructions
 */
export interface StageInstructions {
  stage: string;
  overview: string;
  prerequisites: {
    files: string[];
    completedStages?: string[];
    conditions?: string[];
  };
  steps: Array<{
    id: string;
    action: string;
    command?: string;
    details: string;
    validation?: string;
    critical?: boolean;
  }>;
  outputs: {
    files: string[];
    stateUpdates: Record<string, any>;
  };
  userCommunication: {
    start?: string;
    progress?: string;
    completion: string;
    approval?: string;
  };
  gitCommit?: {
    files: string[];
    messageTemplate: string;
  };
  nextStage?: string;
}

/**
 * Video Workflow Guide Tool - Provides step-by-step instructions for video generation stages
 * 
 * CRITICAL: plan.json slide structure must include:
 * {
 *   scene_id: "slide-001",
 *   title: "Hook - Opening Question",  // Narrative role, NOT display text
 *   layout_type: "layout_hero",
 *   content_description: "Opening slide that captures attention",
 *   facts_used: ["fact 1", "fact 2"],
 *   message: "Key message for this slide",
 *   component_mapping: {  // Actual display content goes here
 *     heading: "Why Sales Matter?",  // This is what appears on screen
 *     subheading: "Master the fundamentals",
 *     image: "sales_chart.png"
 *   },
 *   script_text: "Have you ever wondered why...",
 *   sync_points: ["wondered", "sales", "success"],
 *   estimated_duration: 10
 * }
 */
export class VideoWorkflowGuideTool extends BaseTool<VideoWorkflowGuideParams, ToolResult> {
  static readonly Name = 'video_workflow_step_wise_guide';

  private stageInstructions: Record<string, StageInstructions> = {
    'initial_setup': {
      stage: 'initial_setup',
      overview: 'Generate project title, thumbnail, and establish video context',
      prerequisites: {
        files: ['state.json'],
        conditions: ['First message with [FIRST_VIDEO_MESSAGE] indicator']
      },
      steps: [
        {
          id: 'read_state',
          action: 'Read state.json immediately',
          critical: true,
          details: 'Extract working_directory path from state.json. CRITICAL: Use this path for ALL file operations: {working_directory}/state.json, {working_directory}/slides/, etc.',
          validation: 'Verify working_directory exists and is valid path'
        },
        {
          id: 'analyze_inputs',
          action: 'Analyze user instructions and documents',
          details: 'Read all files in resources/documents/, analyze reference images in resources/images/. Extract key information, data points, and themes.',
          validation: 'Ensure at least basic content understanding achieved'
        },
        {
          id: 'generate_title',
          action: 'Create engaging title',
          details: 'Maximum 60 characters, captures video essence. Should be compelling and descriptive.',
          validation: 'Title length <= 60 chars'
        },
        {
          id: 'generate_thumbnail',
          action: 'Generate 16:9 thumbnail (1920x1080)',
          command: 'generate_image with aspect_ratio: "16:9"',
          details: 'Use color scheme from style/design_instructions.md, represent video theme visually. Use 16:9 aspect ratio. Image must NOT contain embedded text.',
          validation: 'Verify image URL is valid and accessible'
        },
        {
          id: 'create_context',
          action: 'Write video-context.md',
          details: 'Structure: ## Extracted Facts (numbered list), ## Content Sections (chapters), ## Visual Potential (data sets, processes, comparisons, timelines, relationships, statistics)',
          validation: 'File exists with proper structure'
        },
        {
          id: 'intelligent_analysis',
          action: 'Perform intelligent analysis with minimal questions',
          details: 'Automatically determine: video length (based on content volume), visual style (from data types), pacing (from technical depth), key visualizations (from data patterns). Ask only 1-2 essential questions: target audience and call-to-action.',
          validation: 'Analysis complete with smart defaults ready'
        },
        {
          id: 'update_state',
          action: 'Update state.json',
          details: 'Set title, thumbnail URL, video_status: "planning", progress: {currentStage: "planning"}',
          validation: 'State file updated successfully'
        }
      ],
      outputs: {
        files: ['video-context.md', 'state.json'],
        stateUpdates: {
          title: 'string',
          thumbnail: 'url',
          video_status: 'planning',
          progress: { currentStage: 'planning' }
        }
      },
      userCommunication: {
        start: '## 🎬 Creating: [Title]\\n\\n![Project Thumbnail](thumbnail_url)\\n\\nAnalyzing your content and preparing video creation...',
        completion: 'Based on your [content type] about [topic], I will create a [duration] video with [visual style] approach.\\n\\nThe video will feature:\\n- [Specific visualization 1]\\n- [Specific visualization 2]\\n- [Key visual elements]\\n\\n**Just need to confirm:**\\n1. Who is your target audience? (technical/business/general)\\n2. What action should viewers take after watching?\\n\\nReady to proceed? Answer above or type "proceed" to use smart defaults.'
      },
      nextStage: 'planning'
    },

    'planning': {
      stage: 'planning',
      overview: 'Create detailed slide plan and voiceover script following storytelling framework',
      prerequisites: {
        files: ['video-context.md', 'style/design_instructions.md', 'state.json'],
        completedStages: ['initial_setup']
      },
      steps: [
        {
          id: 'load_design',
          action: 'Load design system',
          details: 'Read style/design_instructions.md for style guidelines. Identify available layout templates in style/layout_*.html. Note design patterns, colors, typography specifications.',
          validation: 'Design system loaded successfully'
        },
        {
          id: 'load_context',
          action: 'Read video context',
          details: 'Read video-context.md to recollect the context of the video and the available facts inventory.',
          validation: 'Context loaded with facts inventory'
        },
        {
          id: 'select_framework',
          action: 'Choose story framework',
          details: 'Select based on content: Educational (Hook→Context→Concepts→Examples→Summary→CTA), Product/Service (Problem→Agitation→Solution→Benefits→Proof→CTA), Inspirational (Vision→Challenge→Journey→Transformation→Impact→CTA), Corporate (Overview→Mission→Process→Results→Team→Next Steps)',
          validation: 'Framework selected'
        },
        {
          id: 'plan_timing',
          action: 'Plan slide timing',
          details: 'Each slide: 10-15 seconds default duration (covers 25-35 words at average pace). Adjust based on content complexity. Total slides = Target duration ÷ Average slide duration.',
          validation: 'Timing calculated'
        },
        {
          id: 'create_plan',
          action: 'Create plan.json',
          details: 'Create plan.json file. For each slide MUST include: scene_id (e.g., "slide-001"), title (narrative purpose like "Hook - Opening Question", NOT the display text), layout_type (from style/layout_*.html), content_description (what the slide presents), facts_used (array of facts from video-context.md), message (key takeaway), component_mapping (object mapping layout component IDs to actual content - this is where display text goes, e.g., {heading: "Your Title Text", subheading: "Your Subtitle"}), script_text (voiceover for this slide), sync_points (array of keywords to sync), estimated_duration (in seconds). CRITICAL: The "title" field describes the slide\'s role in the story arc, while component_mapping contains the actual displayed content.',
          validation: 'plan.json created with all required fields including title at root level'
        },
        {
          id: 'write_script',
          action: 'Create voiceover-script.txt',
          details: 'Write voiceover-script.txt file. Pure narration text only (no formatting). Maintain 30-40% max overlap with on-screen text. Natural, conversational flow. Include all slides narration in one continuous script. Voiceover complements, does not duplicate on-screen text.',
          validation: 'Script written to voiceover-script.txt'
        },
        {
          id: 'scaffold_slides',
          action: 'Initialize slide structure',
          command: 'initiate_slides({ plan_json: <plan>, output_directory: "<working_directory>", overwrite_existing: true })',
          details: 'Creates slides/ directory and generates slides/slide-XXX/ for each slide with info.json using the initiate_slides tool.',
          validation: 'Slide directories created'
        },
        {
          id: 'update_state',
          action: 'Update state.json',
          details: 'Keep video_status as "planning", update progress with slide count',
          validation: 'State updated'
        },
        {
          id: 'git_commit',
          action: 'Commit planning artifacts',
          command: 'git add slides/ plan.json voiceover-script.txt state.json && git commit -m "Create video plan and voiceover script for [X] slides"',
          details: 'Commit the slide directory structure and planning files',
          validation: 'Git commit successful'
        }
      ],
      outputs: {
        files: ['plan.json', 'voiceover-script.txt', 'slides/'],
        stateUpdates: {
          video_status: 'planning',
          progress: { 
            currentStage: 'planning',
            totalSlides: 'N'
          }
        }
      },
      userCommunication: {
        start: 'Planning your video structure...',
        completion: '✅ **Video Plan Complete!**\\n\\nI have planned your [X]-slide video with:\\n- Opening hook about [topic]\\n- [Key visualization types] to explain concepts\\n- Clear narrative flow from introduction to call-to-action\\n- Professional narration script\\n\\n**How would you like to proceed?**\\n1. Review the plan first [Shown in the slides tab in the Studio]\\n2. Start creating all slides at once\\n3. Create slides in batches of 3-4 for review\\n4. Create one slide at a time with your feedback\\n\\nWhat works best for you?'
      },
      gitCommit: {
        files: ['slides/', 'plan.json', 'voiceover-script.txt', 'state.json'],
        messageTemplate: 'Create video plan and voiceover script for [X] slides'
      },
      nextStage: 'slide_creation'
    },

    'slide_creation': {
      stage: 'slide_creation',
      overview: 'Transform plan into beautiful visual slides',
      prerequisites: {
        files: ['plan.json', 'style/design_instructions.md', 'resources/slide-template.html'],
        completedStages: ['initial_setup', 'planning']
      },
      steps: [
        {
          id: 'read_plan',
          action: 'Load slide data from plan',
          details: 'For each slide, read: content_description, facts_used, component_mapping, layout_type, script_text, sync_points',
          validation: 'Plan data loaded'
        },
        {
          id: 'load_template',
          action: 'Load layout template',
          details: 'Load assigned layout template from style/layout_*.html. Read resources/slide-template.html for WAAPI animation framework.',
          validation: 'Template loaded'
        },
        {
          id: 'generate_images',
          action: 'Generate and track images for slide',
          command: 'generate_image with appropriate prompts',
          details: 'Generate images for visual elements. For EACH generated asset, track: 1) A descriptive identifier for where it will be used (e.g., "hero_image", "background", "icon_1"), 2) The generation prompt used, 3) The returned asset URL. Keep this data for later storage in info.json. Images must NOT contain embedded text. Focus on visual concepts, patterns, and illustrations. Keep prompts specific to avoid generic images. Use aspect ratios matching layout. Use appropriate colors so that the generated images look visually appealing when placed in the slide. For charts/graphs we DO NOT generate images. We create them using charting libraries in the next step.',
          validation: 'Images generated with tracking data',
          critical: true
        },
        {
          id: 'create_html',
          action: 'Create slide.html',
          details: 'Fill/replace ALL components per plan (never remove components). Create self-contained HTML with all CSS/JS inline. Follow design system exactly. Text should be visually engaging (headings, bullets, numbers) not script verbatim. Use generated images. When placing each asset in HTML, note its actual usage context (e.g., if used in <img id="hero-visual">, the component_id would be "hero-visual"). For CSS background-images, use the containing element\'s id or class as reference. Track where each generated asset is actually placed in the HTML structure. For charts/graphs, use charting libraries (e.g., Chart.js, D3.js) to create interactive visualizations based on facts_used data. Ensure visual hierarchy: 60-70% visual, 30-40% text. Add WAAPI animations for visual interest (fade-ins, slide-ins, zooms). Ensure readability and accessibility (contrast, font size). Save as slides/slide-XXX/slide.html.',
          validation: 'slide.html created with assets properly placed'
        },
        {
          id: 'asset_tracking_note',
          action: 'Understanding asset tracking',
          details: 'IMPORTANT: The asset_component_id should reflect how the asset is actually used in the HTML, not predetermined mappings. Examples: If an image is in <div class="hero-image">, use "hero-image". If it\'s in <div id="slide-background">, use "slide-background". If it\'s inline styled with background-image on an element with class "visual-content", use "visual-content". This allows the UI to locate assets by searching the HTML for these identifiers.',
          validation: 'Asset tracking approach understood'
        },
        {
          id: 'create_info',
          action: 'Create comprehensive info.json with asset tracking',
          details: 'Store all slide data INCLUDING asset tracking. For each generated asset used in the HTML, add to "generated_assets" array with: asset_component_id (the HTML element id/class where it\'s used), asset_url (the generated URL), and asset_prompt (the prompt used to generate it). Also maintain "image_urls" and "video_urls" arrays for UI compatibility. The asset_component_id should match how the asset is referenced in the HTML (e.g., "slide-bg" for a div with id="slide-bg", or "image-placeholder" for an element with class="image-placeholder"). Example structure: generated_assets: [{asset_component_id: "image-placeholder", asset_url: "https://...", asset_prompt: "professional sales team..."}]',
          validation: 'info.json created with complete asset tracking'
        },
        {
          id: 'document_assets',
          action: 'Document asset usage in info.json',
          details: 'Ensure each asset in generated_assets has: 1) asset_component_id matching the HTML element where it\'s used (could be an id, class, or data attribute), 2) asset_url pointing to the generated asset, 3) asset_prompt containing the original generation prompt. This enables the UI to locate and replace assets by finding them in the HTML. Also populate legacy image_urls array with {image_id: asset_component_id, image_url: asset_url} for backward compatibility.',
          validation: 'Asset documentation complete and accurate'
        },
        {
          id: 'script_alignment',
          action: 'Verify script alignment',
          details: 'Verify visual elements align with script sync points. If misaligned, propose slight script modifications.',
          validation: 'Visual-audio coherence verified'
        },
        {
          id: 'update_state',
          action: 'Update state.json',
          details: 'Update progress.slidesCompleted count, mark slide as complete in slides array',
          validation: 'State updated'
        },
        {
          id: 'git_commit',
          action: 'Commit completed slides',
          command: 'git add slides/slide-XXX/ && git commit -m "Complete slide-XXX: [description]"',
          details: 'Commit per slide or per batch depending on user choice',
          validation: 'Git commit successful'
        }
      ],
      outputs: {
        files: ['slides/slide-XXX/slide.html', 'slides/slide-XXX/info.json'],
        stateUpdates: {
          video_status: 'slides',
          progress: {
            currentStage: 'slides',
            slidesCompleted: 'N',
            assetsGenerated: 'N'
          }
        }
      },
      userCommunication: {
        start: 'Creating slides...',
        progress: 'Creating Slide [X]: [Title/Topic]',
        completion: '🎨 **All Slides Complete!**\\n\\nYour slides are ready with:\\n- [X] custom-generated visuals\\n- Professional layouts and design\\n- Smooth flow from introduction to conclusion\\n\\n**Ready for the next step?**\\nI will now generate professional narration that brings your slides to life.\\n\\n[Continue] [Review Slides First]',
        approval: 'Shall I continue with the next slide?'
      },
      gitCommit: {
        files: ['slides/slide-XXX/'],
        messageTemplate: 'Complete slide-XXX: [brief description]'
      },
      nextStage: 'audio_generation'
    },

    'audio_generation': {
      stage: 'audio_generation',
      overview: 'Generate professional narration audio from script',
      prerequisites: {
        files: ['voiceover-script.txt', 'state.json'],
        completedStages: ['initial_setup', 'planning', 'slide_creation']
      },
      steps: [
        {
          id: 'review_script',
          action: 'Review and finalize script',
          details: 'Based on created slides, review full script for cohesiveness. Make minor adjustments if needed while maintaining sync points. Propose changes and get user approval if updating.',
          validation: 'Script finalized'
        },
        {
          id: 'generate_audio',
          action: 'Generate audio narration',
          command: 'generate_audio tool with voiceover-script.txt',
          details: 'Use generate_audio tool to create professional narration. Display audio using HTML5 audio element in chat.',
          validation: 'Audio generated successfully',
          critical: true
        },
        {
          id: 'create_metadata',
          action: 'Update audio metadata',
          details: 'Append new audio version to voiceover-audio.json array with format: {language_code, voice_id, url, duration, created_at, instructions}',
          validation: 'Audio metadata appended'
        },
        {
          id: 'update_state',
          action: 'Update state.json',
          details: 'Update voice_over field with latest audio info. Set video_status to "audio".',
          validation: 'State updated'
        },
        {
          id: 'git_commit',
          action: 'Commit audio files',
          command: 'git add voiceover-audio.json state.json voiceover-script.txt && git commit -m "Generate voiceover audio with [voice-name]"',
          details: 'Commit audio generation and timing updates',
          validation: 'Git commit successful'
        }
      ],
      outputs: {
        files: ['voiceover-audio.json'],
        stateUpdates: {
          video_status: 'audio',
          voice_over: {
            url: 'audio_url',
            duration: 'seconds',
            voice: 'voice_name'
          }
        }
      },
      userCommunication: {
        start: '📝 **Narration Script Ready!**\\n\\nI have prepared professional narration that:\\n- Complements your visuals perfectly\\n- Explains key concepts clearly\\n- Maintains engaging pace throughout\\n\\nWould you like to:\\n1. Generate the audio narration now\\n2. Review the script first\\n3. Make any adjustments',
        completion: '🎙️ **Narration Generated!**\\n<audio controls style="width: 100%; margin: 10px 0;">\\n  <source src="https://audio-url.mp3" type="audio/mpeg">\\n</audio>\\n\\nYour professional narration is ready ([duration] long).\\nPlease listen and let me know if you would like to proceed with synchronization.\\n\\n[Continue to Sync] [Regenerate Audio] [Adjust Script]'
      },
      gitCommit: {
        files: ['voiceover-audio.json', 'state.json', 'voiceover-script.txt'],
        messageTemplate: 'Generate voiceover audio with [voice-name]'
      },
      nextStage: 'synchronization'
    },

    'synchronization': {
      stage: 'synchronization',
      overview: 'Synchronize slides with audio narration',
      prerequisites: {
        files: ['voiceover-audio.json', 'plan.json', 'slides/'],
        completedStages: ['initial_setup', 'planning', 'slide_creation', 'audio_generation']
      },
      steps: [
        {
          id: 'map_timing',
          action: 'Map audio to slides',
          command: 'map_scenes_to_audio tool with audio URL and slide scripts',
          details: 'Generate timing data for each slide: start_time, end_time, word_wise_timings (array of {word, start_time, end_time})',
          validation: 'Timing data generated',
          critical: true
        },
        {
          id: 'update_info_files',
          action: 'Update slide info.json files',
          details: 'Add timing data to each slide info.json: timing: {start_time, end_time, word_wise_timings}',
          validation: 'All info.json files updated'
        },
        {
          id: 'add_animations',
          action: 'Add visual synchronization',
          details: 'For each slide: Use sync_points from plan.json, create visual effects for corresponding elements using word-wise timings from info.json, add WAAPI animations',
          validation: 'Animations added'
        },
        {
          id: 'update_slides',
          action: 'Update slide HTML files',
          details: 'Add synchronized animations to slide.html files. Ensure key points highlight at right moments.',
          validation: 'Slide HTML updated'
        },
        {
          id: 'update_state',
          action: 'Update state.json',
          details: 'Set video_status to "timing", update progress.currentStage',
          validation: 'State updated'
        },
        {
          id: 'git_commit',
          action: 'Commit synchronized slides',
          command: 'git add slides/ && git commit -m "Add synchronization to slides with audio timing"',
          details: 'Commit timing updates and animations',
          validation: 'Git commit successful'
        }
      ],
      outputs: {
        files: ['slides/slide-XXX/info.json', 'slides/slide-XXX/slide.html'],
        stateUpdates: {
          video_status: 'timing',
          progress: {
            currentStage: 'timing'
          }
        }
      },
      userCommunication: {
        start: '🎬 **Synchronizing Slides with Narration...**\\n\\nAdding professional touches:\\n- Key points will highlight as they are mentioned\\n- Visuals will animate in sync with the narration\\n- Smooth transitions between concepts\\n\\n[Processing...]',
        completion: '⚡ **Synchronization Complete!**\\n\\nYour slides now animate perfectly with the narration:\\n- Key points highlight at the right moments\\n- Visual transitions sync with speech\\n- Smooth, professional flow throughout\\n\\nReady to see your complete video?\\n\\n[Create Final Video] [Preview Timing]'
      },
      gitCommit: {
        files: ['slides/'],
        messageTemplate: 'Add synchronization to slides with audio timing'
      },
      nextStage: 'assembly'
    },

    'assembly': {
      stage: 'assembly',
      overview: 'Assemble final video player with synchronized playback',
      prerequisites: {
        files: ['resources/index-template.html', 'slides/', 'voiceover-audio.json'],
        completedStages: ['initial_setup', 'planning', 'slide_creation', 'audio_generation', 'synchronization']
      },
      steps: [
        {
          id: 'create_player',
          action: 'Create final video player',
          details: 'Copy resources/index-template.html to index.html. Populate SLIDE_TIMINGS array from timing data in slides/slide-XXX/info.json.',
          validation: 'index.html created'
        },
        {
          id: 'configure_audio',
          action: 'Configure audio source',
          details: 'Set audio source URL in index.html, configure playback controls',
          validation: 'Audio configured'
        },
        {
          id: 'enable_transitions',
          action: 'Enable slide transitions',
          details: 'Configure synchronized slide transitions based on timing data',
          validation: 'Transitions enabled'
        },
        {
          id: 'finalize_player',
          action: 'Finalize video player',
          details: 'Ensure all media is embedded for immediate playback. Test synchronization.',
          validation: 'Player finalized'
        },
        {
          id: 'update_state',
          action: 'Final state.json update',
          details: 'Set video_status to "complete", update progress.currentStage to "complete"',
          validation: 'State finalized'
        },
        {
          id: 'git_commit',
          action: 'Commit final video',
          command: 'git add index.html state.json && git commit -m "Complete video assembly with synchronized slide timing"',
          details: 'Final commit for assembled video',
          validation: 'Git commit successful'
        }
      ],
      outputs: {
        files: ['index.html'],
        stateUpdates: {
          video_status: 'complete',
          progress: {
            currentStage: 'complete'
          }
        }
      },
      userCommunication: {
        completion: '🎬 **Your Video is Ready!**\\n\\n[Video player embedded here]\\n\\nYour professional video includes:\\n- [X] beautifully designed slides\\n- [Duration] of engaging content\\n- Synchronized narration and animations\\n- Smooth transitions and professional polish\\n\\nYou can now:\\n- Watch the complete video above\\n- Make adjustments if needed\\n- Download or share your creation\\n\\nWhat would you like to do next?'
      },
      gitCommit: {
        files: ['index.html', 'state.json'],
        messageTemplate: 'Complete video assembly with synchronized slide timing'
      }
    }
  };

  constructor() {
    super(
      VideoWorkflowGuideTool.Name,
      'Video Workflow Step-Wise Guide',
      'Returns detailed step-by-step instructions for each stage of video generation workflow. Call this tool to get precise instructions for any stage: initial_setup, planning, slide_creation, audio_generation, synchronization, or assembly.',
      {
        type: 'object',
        properties: {
          stage: {
            type: 'string',
            enum: ['initial_setup', 'planning', 'slide_creation', 'audio_generation', 'synchronization', 'assembly'],
            description: 'The workflow stage to get instructions for'
          },
          context: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Working directory path' },
              currentState: { type: 'object', description: 'Current project state' },
              userChoice: { type: 'string', description: 'User preference (e.g., batch, one-by-one, all)' }
            },
            description: 'Optional context to customize instructions'
          }
        },
        required: ['stage']
      }
    );
  }

  async execute(params: VideoWorkflowGuideParams): Promise<ToolResult> {
    const instructions = this.stageInstructions[params.stage];
    
    if (!instructions) {
      return {
        llmContent: JSON.stringify({ error: `Unknown stage: ${params.stage}` }),
        returnDisplay: `❌ Unknown stage: ${params.stage}`
      };
    }

    // Deep clone to avoid modifying original
    let customizedInstructions = JSON.parse(JSON.stringify(instructions));
    
    // Customize based on context if provided
    if (params.context?.userChoice) {
      if (params.stage === 'slide_creation') {
        if (params.context.userChoice === 'batch') {
          // Modify for batch processing
          customizedInstructions.steps = customizedInstructions.steps.map((step: any) => {
            if (step.id === 'create_html' || step.id === 'generate_images') {
              return {
                ...step,
                details: step.details + ' Process in batches of 3-4 slides for review.'
              };
            }
            return step;
          });
          customizedInstructions.userCommunication.progress = 'Creating slides 1-3...';
          customizedInstructions.userCommunication.approval = 'First 3 slides ready! Would you like to review them or continue with the next batch?';
        } else if (params.context.userChoice === 'one-by-one') {
          // Modify for one-by-one processing
          customizedInstructions.userCommunication.progress = 'Creating Slide 1: [Title/Topic]';
          customizedInstructions.userCommunication.approval = '✅ Slide 1 is ready! Shall I continue with slide 2?';
        }
      }
    }

    return {
      llmContent: JSON.stringify(customizedInstructions),
      returnDisplay: this.formatInstructionsForDisplay(customizedInstructions)
    };
  }

  private formatInstructionsForDisplay(instructions: StageInstructions): string {
    let output = `📋 **${instructions.stage.replace(/_/g, ' ').toUpperCase()}**\n`;
    output += `Overview: ${instructions.overview}\n\n`;
    
    output += `**Prerequisites:**\n`;
    instructions.prerequisites.files.forEach(f => output += `  - ${f}\n`);
    if (instructions.prerequisites.conditions) {
      output += `  Conditions:\n`;
      instructions.prerequisites.conditions.forEach(c => output += `    - ${c}\n`);
    }
    
    output += `\n**Steps:**\n`;
    instructions.steps.forEach((step, i) => {
      output += `${i+1}. ${step.critical ? '🔴 ' : ''}**${step.action}**\n`;
      output += `   ${step.details}\n`;
      if (step.command) output += `   _Command: ${step.command}_\n`;
      if (step.validation) output += `   ✓ ${step.validation}\n`;
      output += '\n';
    });
    
    if (instructions.outputs) {
      output += `**Outputs:**\n`;
      output += `  Files: ${instructions.outputs.files.join(', ')}\n`;
      output += `  State Updates: ${JSON.stringify(instructions.outputs.stateUpdates, null, 2)}\n\n`;
    }
    
    if (instructions.nextStage) {
      output += `**Next Stage:** ${instructions.nextStage}\n`;
    }
    
    return output;
  }
}