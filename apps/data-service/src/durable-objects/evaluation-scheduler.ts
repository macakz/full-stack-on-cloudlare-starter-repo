import { DurableObject } from 'cloudflare:workers';
import moment from 'moment';


interface ClickData {
	accountId: string;
	linkId: string;
	destinationUrl: string;
	destinationCountryCode: string;
}


export class EvaluationScheduler extends DurableObject<Env> {
    clickData: ClickData | undefined;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env)
        ctx.blockConcurrencyWhile(async () => {
            this.clickData = await ctx.storage.get<ClickData>('click_data');
        })
    }

    async collectLinkClick(accountId: string, linkId: string, destinationUrl: string, destinationCountryCode: string) {
        console.log(`collectLinkClick called for link ${linkId}, destination ${destinationUrl}`);
        this.clickData = {
			accountId,
			linkId,
			destinationUrl,
			destinationCountryCode,
		};
        await this.ctx.storage.put('click_data', this.clickData);
        console.log('Click data saved to storage');

        const alarm = await this.ctx.storage.getAlarm();
        const alarmTime = moment().add(24, "seconds").valueOf();
        
        if (!alarm) {
            await this.ctx.storage.setAlarm(alarmTime);
            console.log(`Alarm set for ${new Date(alarmTime).toISOString()} for link ${linkId}`);
        } else {
            // Update alarm to the new time (reset the timer)
            await this.ctx.storage.setAlarm(alarmTime);
            console.log(`Alarm updated from ${new Date(alarm).toISOString()} to ${new Date(alarmTime).toISOString()} for link ${linkId}`);
        }
    }

    async alarm() {
		console.log('Evaluation scheduler alarm triggered');

        // Reload clickData from storage since alarm runs in separate execution context
        const clickData = await this.ctx.storage.get<ClickData>('click_data');
        
        if (!clickData) {
            console.error("Click data not found in storage during alarm");
            throw new Error("Click data not set");
        }

        console.log('Creating workflow with params:', {
            linkId: clickData.linkId,
            accountId: clickData.accountId,
            destinationUrl: clickData.destinationUrl
        });
            
        try {
            const workflow = await this.env.DESTINATION_EVALUATION_WORKFLOW.create({
                params: {
                    linkId: clickData.linkId,
                    accountId: clickData.accountId,
                    destinationUrl: clickData.destinationUrl
                }
            });
            console.log('Workflow created successfully:', workflow.id);
        } catch (error) {
            console.error('Failed to create workflow:', error);
            throw error;
        }
    }

}
